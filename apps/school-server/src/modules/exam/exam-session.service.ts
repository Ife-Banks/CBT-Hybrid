import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import {
  StudentCodeValidator,
  markPackSession,
  normalise,
  parseCode,
  prepareSessionQuestions,
  sha256Hex,
  verifyExamKey,
  type PackAnswerValue,
} from '@cbt/exam-core';
import { uuidv7 } from '@cbt/shared-types';
import { problem } from '../../common/http/problem';
import { CATALOG_REPOSITORY, type CatalogRepository } from './repositories/catalog.repository';
import { PACK_REPOSITORY, type PackRepository } from './repositories/pack.repository';
import { SESSION_REPOSITORY, type SessionRepository } from './repositories/session.repository';
import { OUTBOX_REPOSITORY, type OutboxRepository } from './repositories/outbox.repository';
import { META_KEYS, META_REPOSITORY, type MetaRepository } from './repositories/meta.repository';
import { PackImportService } from './pack-import.service';
import { TicketService, type TicketClaims } from './ticket.service';
import { LoginThrottleService } from './login-throttle.service';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { join } from 'node:path';
import type {
  AnswerChange,
  ExamRecord,
  PackRecord,
  SessionQuestion,
  SessionRecord,
  SittingRecord,
  SubmitReason,
} from './domain/types';

export interface LoginInput {
  studentCode: string;
  examKey: string;
  seat: string | null;
}

export interface AnswerBatch {
  seq: number;
  changes: AnswerChange[];
}

const studentCodes = new StudentCodeValidator();

function nowIso(now = Date.now()): string {
  return new Date(now).toISOString();
}

function remainingMs(endsAt: string, now = Date.now()): number {
  return Math.max(0, Date.parse(endsAt) - now);
}

/**
 * The student exam flow (API spec section 16): login, start, read the session,
 * autosave answers, ping and submit, plus the server-side expiry sweep. All
 * gameplay rules (ordering, marking) come from `@cbt/exam-core`; this service
 * only owns persistence, timing and the HTTP contract.
 */
@Injectable()
export class ExamSessionService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly catalogRepo: CatalogRepository,
    @Inject(PACK_REPOSITORY) private readonly packRepo: PackRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: SessionRepository,
    @Inject(OUTBOX_REPOSITORY) private readonly outboxRepo: OutboxRepository,
    @Inject(META_REPOSITORY) private readonly metaRepo: MetaRepository,
    private readonly packImport: PackImportService,
    private readonly tickets: TicketService,
    private readonly throttle: LoginThrottleService,
    private readonly config: SchoolConfigService,
  ) {}

  /** `GET /status` - public login-screen information (API spec 16.2). */
  async getStatus(ip: string | null) {
    const [schoolName, openSittings] = await Promise.all([
      this.metaRepo.get(META_KEYS.schoolName),
      this.catalogRepo.countOpenSittings(),
    ]);
    const seat = ip ? await this.catalogRepo.findSeatByIp(ip) : null;

    return {
      school_name: schoolName ?? '',
      server_time: nowIso(),
      open_sittings: openSittings,
      seat: seat?.code ?? null,
    };
  }

  /** `POST /login` (API spec 16.3). */
  async login(input: LoginInput, ip: string | null) {
    const seat = input.seat ?? (ip ? ((await this.catalogRepo.findSeatByIp(ip))?.code ?? null) : null);

    if (seat && this.throttle.isLocked(seat)) {
      throw problem('SEAT_LOCKED', 'Too many failed attempts from this seat');
    }

    // A failure never reveals which part (code or key) was wrong beyond the
    // catalogue messages, and every failure counts against the seat.
    const fail = (code: Parameters<typeof problem>[0], detail: string) => {
      if (seat) this.throttle.recordFailure(seat);
      return problem(code, detail);
    };

    if (!studentCodes.validateCode(input.studentCode)) {
      throw fail('CODE_FORMAT_INVALID', 'Student code is not valid');
    }
    const parsed = parseCode(normalise(input.studentCode));
    if (!parsed) {
      throw fail('CODE_FORMAT_INVALID', 'Student code is not valid');
    }

    const student = await this.catalogRepo.findStudentByCode(
      `${parsed.schoolCode}-${parsed.codeBody}`,
    );
    if (!student) {
      throw fail('CODE_NOT_FOUND', 'Student code was not found');
    }
    if (student.codeStatus !== 'active') {
      throw fail('CODE_REVOKED', 'Student code is revoked');
    }
    if (!student.classId) {
      throw fail('NOT_IN_SITTING', 'Student is not in a class with a sitting');
    }

    const openSittings = await this.catalogRepo.listOpenSittingsForClass(student.classId);
    const sitting = openSittings.find(
      (candidate) =>
        candidate.examKeyHash !== null &&
        verifyExamKey(candidate.id, input.examKey, candidate.examKeyHash),
    );
    if (!sitting) {
      throw fail('KEY_INVALID', 'Exam key is invalid for this class');
    }

    const exam = await this.catalogRepo.findExam(sitting.examId);
    if (!exam) {
      throw fail('NOT_FOUND', 'Exam is not available on this server');
    }
    const pack = await this.packRepo.findById(sitting.packId);
    if (!pack) {
      throw fail('NOT_FOUND', 'Exam pack is missing');
    }

    const [className, subjectName] = await Promise.all([
      this.catalogRepo.findClassName(student.classId),
      this.catalogRepo.findSubjectName(exam.subjectId),
    ]);

    if (seat) await this.catalogRepo.touchSeat(seat, nowIso(), ip);

    const studentInfo = {
      full_name: student.fullName,
      class_name: className,
      section: student.section,
    };
    const examInfo = this.examInfo(exam, pack, subjectName);

    // A live session is resumed: the server issues a new token and the old one
    // stops working, which is how a student moves PC or recovers a frozen one
    // (API spec 16.1).
    const live = await this.sessionRepo.findInProgressBySittingAndStudent(sitting.id, student.id);
    if (live) {
      const token = this.newToken();
      await this.sessionRepo.rotateToken(live.id, sha256Hex(token), nowIso(), ip);
      this.throttle.clear(seat ?? '');
      return {
        state: 'in_progress' as const,
        session_token: token,
        session_id: live.id,
        student: studentInfo,
        exam: examInfo,
        remaining_ms: remainingMs(live.endsAt),
        ends_at: live.endsAt,
        seq: live.lastSeq,
      };
    }

    // Someone else is live on this seat.
    if (seat) {
      const liveOnSeat = await this.sessionRepo.findInProgressBySeat(seat);
      if (liveOnSeat && liveOnSeat.studentId !== student.id) {
        throw problem('SESSION_ACTIVE_ELSEWHERE', 'That seat already has an active session');
      }
    }

    this.throttle.clear(seat ?? '');
    return {
      state: 'ready' as const,
      ticket: this.tickets.issue({
        student_id: student.id,
        sitting_id: sitting.id,
        seat,
      }),
      student: studentInfo,
      exam: examInfo,
    };
  }

  /** `POST /start` (API spec 16.4). */
  async start(claims: TicketClaims, ip: string | null) {
    const sitting = await this.catalogRepo.findSitting(claims.sitting_id);
    if (!sitting || sitting.status !== 'open') {
      throw problem('SITTING_NOT_OPEN', 'Sitting is not open');
    }

    const student = await this.catalogRepo.findStudentById(claims.student_id);
    if (!student) {
      throw problem('AUTH_REQUIRED', 'Ticket is no longer valid');
    }
    if (student.codeStatus !== 'active') {
      throw problem('CODE_REVOKED', 'Student code is revoked');
    }

    const alreadySubmitted = await this.sessionRepo.findSubmittedForStudentExam(
      student.id,
      sitting.examId,
    );
    if (alreadySubmitted) {
      throw problem('ALREADY_SUBMITTED', 'This student has already submitted this exam');
    }

    const exam = await this.catalogRepo.findExam(sitting.examId);
    if (!exam) {
      throw problem('NOT_FOUND', 'Exam is not available on this server');
    }
    const pack = await this.packRepo.findById(sitting.packId);
    if (!pack) {
      throw problem('NOT_FOUND', 'Exam pack is missing');
    }

    const now = Date.now();
    const startedAt = nowIso(now);
    const durationMs = (exam.durationMin + sitting.extraTimeMin) * 60_000;
    const endsAt = new Date(Math.min(now + durationMs, Date.parse(sitting.windowEnd))).toISOString();

    const token = this.newToken();
    const session: SessionRecord = {
      id: uuidv7(),
      sittingId: sitting.id,
      studentId: student.id,
      seat: claims.seat,
      tokenHash: sha256Hex(token),
      seed: randomInt(0, 2 ** 31),
      startedAt,
      endsAt,
      status: 'in_progress',
      submittedAt: null,
      submitReason: null,
      lastSeq: 0,
      focusLostCount: 0,
      lastSeenAt: startedAt,
      lastIp: ip,
    };
    await this.sessionRepo.create(session);

    await this.outboxRepo.insert({
      eventId: uuidv7(),
      type: 'session.started',
      createdAt: startedAt,
      payload: {
        session_id: session.id,
        sitting_id: sitting.id,
        exam_id: sitting.examId,
        student_id: student.id,
        pack_version: pack.version,
        seat: claims.seat,
        started_at: startedAt,
        ends_at: endsAt,
      },
    });

    const questions = await this.sessionQuestions(pack.id, session.seed, exam);

    return {
      session_token: token,
      session_id: session.id,
      started_at: startedAt,
      ends_at: endsAt,
      remaining_ms: remainingMs(endsAt, now),
      seq: 0,
      questions,
      assets_base: '/api/v1/exam/assets/',
    };
  }

  /** `GET /session` (API spec 16.5). */
  async getSession(session: SessionRecord, ip: string | null) {
    this.assertOpen(session);
    await this.sessionRepo.touch(session.id, nowIso(), ip);

    const { exam, pack } = await this.loadContext(session);
    const questions = await this.sessionQuestions(pack.id, session.seed, exam);
    const answers = await this.sessionRepo.listAnswers(session.id);

    return {
      session_id: session.id,
      status: session.status,
      ends_at: session.endsAt,
      remaining_ms: remainingMs(session.endsAt),
      server_time: nowIso(),
      seq: session.lastSeq,
      questions,
      answers: answers.map((answer) => ({
        question_id: answer.questionId,
        answer: answer.answer,
        flagged: answer.flagged,
      })),
    };
  }

  /** `PUT /session/answers` (API spec 16.6). */
  async saveAnswers(session: SessionRecord, batch: AnswerBatch, ip: string | null) {
    this.assertOpen(session);

    const { pack } = await this.loadContext(session);
    const known = await this.packQuestionIds(pack.id);
    const changes = batch.changes.filter((change) => known.has(change.questionId));

    const at = nowIso();
    const ackSeq = await this.sessionRepo.saveAnswers(session.id, changes, batch.seq, at);
    if (ip) await this.sessionRepo.touch(session.id, at, ip);

    return {
      ack_seq: ackSeq,
      saved_at: at,
      server_time: at,
      remaining_ms: remainingMs(session.endsAt),
      ends_at: session.endsAt,
      status: session.status,
    };
  }

  /** `POST /ping` (API spec 16.7). */
  async ping(session: SessionRecord, ip: string | null) {
    if (session.status === 'in_progress') {
      await this.sessionRepo.touch(session.id, nowIso(), ip);
    }
    return {
      remaining_ms: remainingMs(session.endsAt),
      ends_at: session.endsAt,
      server_time: nowIso(),
      status: session.status,
    };
  }

  /** `POST /session/submit` (API spec 16.8). */
  async submit(session: SessionRecord, batch: AnswerBatch | null, ip: string | null) {
    this.assertOpen(session);

    const at = nowIso();
    const { exam, pack } = await this.loadContext(session);

    const known = batch && batch.changes.length > 0 ? await this.packQuestionIds(pack.id) : null;
    const changes = !batch
      ? []
      : known
        ? batch.changes.filter((change) => known.has(change.questionId))
        : batch.changes;
    const seq = batch ? batch.seq : session.lastSeq;

    const score = await this.finalise(session, 'student', at, seq, changes);
    await this.sessionRepo.touch(session.id, at, ip);

    return {
      status: 'submitted' as const,
      submitted_at: at,
      score: exam.settings.show_score_to_student
        ? { score: score.score, max_score: score.max_score, percent: score.percent }
        : null,
    };
  }

  /**
   * Server-side expiry sweep (API spec 16.9). Runs every few seconds: sessions
   * past `ends_at` are submitted with `time_up`, and sessions whose sitting
   * window has closed are submitted with `window_closed`.
   */
  async expireDue(now = Date.now()): Promise<{ time_up: number; window_closed: number }> {
    const at = nowIso(now);

    const expired = await this.sessionRepo.listExpired(at);
    let timeUp = 0;
    for (const session of expired) {
      await this.finalise(session, 'time_up', at, session.lastSeq, []);
      timeUp += 1;
    }

    const done = new Set(expired.map((session) => session.id));
    const pastWindow = await this.sessionRepo.listPastWindowEnd(at);
    let windowClosed = 0;
    for (const session of pastWindow) {
      if (done.has(session.id)) continue;
      await this.finalise(session, 'window_closed', at, session.lastSeq, []);
      windowClosed += 1;
    }

    return { time_up: timeUp, window_closed: windowClosed };
  }

  // ── internals ────────────────────────────────────────────────────────────

  private assertOpen(session: SessionRecord): void {
    if (session.status === 'in_progress') return;
    const detail =
      session.status === 'expired'
        ? 'Session has expired'
        : session.status === 'reset'
          ? 'Session was reset'
          : 'Session has already been submitted';
    throw problem('SESSION_CLOSED', detail);
  }

  private newToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private examInfo(exam: ExamRecord, pack: PackRecord, subjectName: string | null) {
    return {
      title: exam.title,
      subject: subjectName,
      duration_min: exam.durationMin,
      question_count: pack.questionCount ?? 0,
      instructions_html: exam.settings.instructions_html,
      show_score_to_student: exam.settings.show_score_to_student,
    };
  }

  private async loadContext(
    session: SessionRecord,
  ): Promise<{ sitting: SittingRecord; exam: ExamRecord; pack: PackRecord }> {
    const sitting = await this.catalogRepo.findSitting(session.sittingId);
    if (!sitting) throw problem('NOT_FOUND', 'Sitting is not available on this server');
    const exam = await this.catalogRepo.findExam(sitting.examId);
    if (!exam) throw problem('NOT_FOUND', 'Exam is not available on this server');
    const pack = await this.packRepo.findById(sitting.packId);
    if (!pack) throw problem('NOT_FOUND', 'Exam pack is missing');
    return { sitting, exam, pack };
  }

  private async sessionQuestions(
    packId: string,
    seed: number,
    exam: ExamRecord,
  ): Promise<SessionQuestion[]> {
    const contents = await this.packImport.loadPack(packId);
    return prepareSessionQuestions(contents.questions, seed, {
      shuffleQuestions: exam.settings.shuffle_questions,
      shuffleOptions: exam.settings.shuffle_options,
    });
  }

  private async packQuestionIds(packId: string): Promise<Set<string>> {
    const contents = await this.packImport.loadPack(packId);
    return new Set(contents.questions.map((question) => question.question_id));
  }

  /**
   * Mark and finish a session, emitting `session.submitted` + `session.scored`
   * and storing the result in the same transaction (API spec 16.8). Used by
   * both explicit submission and the expiry sweep.
   */
  private async finalise(
    session: SessionRecord,
    reason: SubmitReason,
    at: string,
    seq: number,
    changes: readonly AnswerChange[],
  ): Promise<{ score: number; max_score: number; percent: number }> {
    const { sitting, pack } = await this.loadContext(session);
    const stored = await this.sessionRepo.listAnswers(session.id);
    const storedByQuestion = new Map(stored.map((answer) => [answer.questionId, answer]));

    // The `answers` trigger ignores a write whose seq is not newer, so only
    // those changes will reach storage; score and report exactly those.
    const applied = changes.filter(
      (change) => (storedByQuestion.get(change.questionId)?.seq ?? -1) < seq,
    );

    const answersMap: Record<string, PackAnswerValue> = {};
    for (const answer of stored) answersMap[answer.questionId] = answer.answer;
    for (const change of applied) answersMap[change.questionId] = change.answer;

    let score = { score: 0, max_score: 0, percent: 0 };
    let perQuestion: Array<{ question_id: string; marks: number }> = [];
    const contents = await this.packImport.loadPack(pack.id, { withKeys: true });
    if (contents.keys) {
      const marked = markPackSession(contents.keys, answersMap);
      score = { score: marked.score, max_score: marked.max_score, percent: marked.percent };
      perQuestion = marked.per_question;
    }

    const finalAnswers = stored.map((answer) => ({ ...answer }));
    for (const change of applied) {
      const existing = finalAnswers.find((answer) => answer.questionId === change.questionId);
      if (existing) {
        existing.answer = change.answer;
        existing.flagged = change.flagged;
        existing.seq = seq;
        existing.savedAt = at;
      } else {
        finalAnswers.push({
          sessionId: session.id,
          questionId: change.questionId,
          answer: change.answer,
          flagged: change.flagged,
          seq,
          savedAt: at,
        });
      }
    }

    await this.sessionRepo.completeSession({
      sessionId: session.id,
      submittedAt: at,
      reason,
      seq,
      changes: applied,
      result: {
        sessionId: session.id,
        score: score.score,
        maxScore: score.max_score,
        percent: score.percent,
        grade: null,
        scoredAt: at,
      },
      events: [
        {
          eventId: uuidv7(),
          type: 'session.submitted',
          createdAt: at,
          payload: {
            session_id: session.id,
            sitting_id: session.sittingId,
            exam_id: sitting.examId,
            student_id: session.studentId,
            pack_version: pack.version,
            seat: session.seat,
            started_at: session.startedAt,
            submitted_at: at,
            submit_reason: reason,
            extra_seconds: (sitting.extraTimeMin ?? 0) * 60,
            answers: finalAnswers.map((answer) => ({
              question_id: answer.questionId,
              answer: answer.answer,
              flagged: answer.flagged,
              seq: answer.seq,
              answered_at: answer.savedAt,
            })),
            integrity: { focus_lost_count: session.focusLostCount },
          },
        },
        {
          eventId: uuidv7(),
          type: 'session.scored',
          createdAt: at,
          payload: {
            session_id: session.id,
            score: score.score,
            max_score: score.max_score,
            key_version: pack.keyVersion,
            per_question: perQuestion,
            scored_at: at,
          },
        },
      ],
    });

    return score;
  }

  // ── NEW PUBLIC METHODS (exposed via ExamController) ────────────────────────

  /**
   * Submit answers for a session (POST /api/v1/exam/session/:sessionId/submit)
   */
  async submitAnswers(
    sessionId: string,
    batch: AnswerBatch,
    ip: string | null,
  ): Promise<{ status: string; submittedAt: string; sessionId: string }> {
    const session = await this.getSessionById(sessionId, ip);
    const result = await this.saveAnswers(session, batch, ip);
    return {
      status: result.status,
      submittedAt: result.saved_at,
      sessionId,
    };
  }

  /**
   * Get the current status of a session (GET /api/v1/exam/session/:sessionId/status)
   */
  async getSessionStatus(sessionId: string, ip: string | null): Promise<{
    id: string;
    sittingId: string;
    status: string;
    startedAt: string;
    endsAt: string;
    timeUp: number;
    windowClosed: number;
    focusLostCount: number;
    lastSeenAt: string;
    lastIp: string | null;
  }> {
    const sess = await this.getSessionById(sessionId, ip);
    const now = Date.now();
    return {
      id: sess.id,
      sittingId: sess.sittingId,
      status: sess.status,
      startedAt: sess.startedAt,
      endsAt: sess.endsAt,
      timeUp: Math.max(0, Date.parse(sess.endsAt) - now),
      windowClosed: 0, // Would need sitting windowEnd to compute
      focusLostCount: sess.focusLostCount,
      lastSeenAt: sess.lastSeenAt ?? '',
      lastIp: sess.lastIp ?? '',
    };
  }

  /**
   * Retrieve a full session object (GET /api/v1/exam/session/:sessionId)
   */
  async getFull(sessionId: string, ip: string | null): Promise<SessionRecord> {
    return this.getSessionById(sessionId, ip);
  }

  /**
   * Return absolute path of an imported pack (used by PackController to stream files)
   */
  getPackPath(packId: string): string {
    return join(this.config.examPackFolders.active, packId);
  }

  /**
   * Return absolute path of an asset inside a pack (used by AssetController)
   */
  getAssetPath(packId: string, assetRelativePath: string): string {
    const packFolder = this.getPackPath(packId);
    return join(packFolder, 'assets', assetRelativePath);
  }

  // Helper to get a session by ID (not by SessionRecord)
  private async getSessionById(sessionId: string, ip: string | null): Promise<SessionRecord> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw problem('NOT_FOUND', 'Session not found');
    }
    // Touch for activity tracking
    await this.sessionRepo.touch(session.id, nowIso(), ip);
    return session;
  }
  // ─────────────────────────────────────────────────────────────────────────────
}