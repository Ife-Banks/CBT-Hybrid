import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PackAnswerValue, PackQuestionKey } from '@cbt/exam-core';
import { BuildResultReport } from './domain/report';
import { gradeForPercent, percentOf } from './domain/grading';
import { keysFromExamQuestions, markSubmission } from './domain/marking';
import { canRelease, canReview, canWithdraw } from './domain/result-status';
import type {
  ExamQuestionKeyInfo,
  RemarkCorrection,
  RemarkPreviewEntry,
  RemarkRunRecord,
  ResultRecord,
  ResultStatus,
  SubmissionAnswerRecord,
} from './domain/types';
import { GradeScaleService } from './grade-scale.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  REMARK_RUN_REPOSITORY,
  RESULT_REPOSITORY,
  RESULTS_DIRECTORY,
  SUBMISSION_REPOSITORY,
  type DirectoryRepository,
  type RemarkRunRepository,
  type ResultRepository,
  type SubmissionRepository,
} from './repositories';

export interface SubmissionAnswerInput {
  question_id: string;
  answer: PackAnswerValue;
  flagged?: boolean;
  seq?: number;
  answered_at?: string | Date | null;
}

export interface ProcessSubmissionInput {
  submissionId: string;
  schoolId: string;
  sittingId: string;
  studentId: string;
  examId: string;
  classId?: string | null;
  packVersion: number;
  keyVersion?: number;
  seat?: string | null;
  startedAt?: string | Date | null;
  submittedAt?: string | Date | null;
  submitReason?: string | null;
  focusLostCount?: number;
  extraSeconds?: number;
  answers: SubmissionAnswerInput[];
}

export interface RecordSchoolScoreInput {
  score: number;
  maxScore: number;
  keyVersion?: number;
  scoredAt?: string | Date | null;
}

export interface RecordSchoolScoreResult {
  mismatch: boolean;
  result: ResultRecord | null;
}

export interface ResultListItem {
  id: string;
  student: { id: string; fullName: string | null; admissionNo: string | null };
  examId: string;
  classId: string | null;
  score: number;
  maxScore: number;
  percent: number;
  grade: string | null;
  status: ResultStatus;
  revision: number;
  updated: boolean;
}

export interface ResultDetail extends ResultListItem {
  submissionId: string;
  submittedAt: Date | null;
  submitReason: string | null;
  focusLostCount: number;
  extraSeconds: number;
  answers: Array<{
    questionId: string;
    answer: PackAnswerValue;
    marks: number;
    maxMarks: number;
    flagged: boolean;
  }>;
}

export interface ReviewSummary {
  reviewed: number;
  skipped: number;
}

export interface ReleaseResult {
  released: number;
  notificationsQueued: number;
}

export interface WithdrawResult {
  withdrawn: number;
}

export interface KeyCorrectionInput {
  examId: string;
  questionId: string;
  correctOptionIds?: string[];
  fillAnswers?: string[];
  caseSensitive?: boolean;
  reason: string;
}

export interface KeyCorrectionPreview {
  run: RemarkRunRecord;
  changes: RemarkPreviewEntry[];
}

export interface ApplyRemarkResult {
  applied: number;
  unchanged: number;
  notificationsQueued: number;
  appliedAt: Date | null;
}

const MAX_PREVIEW = 100;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * Marking, review, release and re-marking (API spec 9). The cloud re-marks with
 * the shared `exam-core` engine, computes the grade from the school's scale and
 * enforces the BR-14 status machine.
 */
@Injectable()
export class ResultsService {
  constructor(
    @Inject(RESULT_REPOSITORY) private readonly results: ResultRepository,
    @Inject(SUBMISSION_REPOSITORY) private readonly submissions: SubmissionRepository,
    @Inject(REMARK_RUN_REPOSITORY) private readonly remarkRuns: RemarkRunRepository,
    @Inject(RESULTS_DIRECTORY) private readonly directory: DirectoryRepository,
    private readonly gradeScales: GradeScaleService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Re-mark a submitted session and create/refresh its draft result (API spec
   * 15.1, `session.submitted`).
   */
  async processSubmission(input: ProcessSubmissionInput): Promise<ResultRecord> {
    const exam = await this.directory.getExam(input.examId);
    const questions = await this.directory.listExamQuestions(input.examId);
    const keys = keysFromExamQuestions(questions);

    const answerValues: Record<string, PackAnswerValue | undefined> = {};
    for (const answer of input.answers) answerValues[answer.question_id] = answer.answer;

    const marked = markSubmission(keys, answerValues);
    const marksByQuestion = new Map(marked.perAnswer.map((answer) => [answer.questionId, answer]));

    const submission = await this.submissions.upsert({
      id: input.submissionId,
      schoolId: input.schoolId,
      sittingId: input.sittingId,
      studentId: input.studentId,
      examId: input.examId,
      classId: input.classId ?? null,
      packVersion: input.packVersion,
      keyVersion: input.keyVersion ?? 1,
      seat: input.seat ?? null,
      startedAt: toDate(input.startedAt),
      submittedAt: toDate(input.submittedAt) ?? new Date(),
      submitReason: input.submitReason ?? null,
      cloudScore: marked.score,
      focusLostCount: input.focusLostCount ?? 0,
      extraSeconds: input.extraSeconds ?? 0,
    });

    const answerRecords: SubmissionAnswerRecord[] = input.answers.map((answer) => {
      const markedAnswer = marksByQuestion.get(answer.question_id);
      return {
        submissionId: input.submissionId,
        questionId: answer.question_id,
        answer: answer.answer,
        flagged: answer.flagged ?? false,
        seq: answer.seq ?? 0,
        answeredAt: toDate(answer.answered_at),
        cloudMarks: markedAnswer?.marks ?? null,
        maxMarks: markedAnswer?.maxMarks ?? null,
      };
    });
    await this.submissions.saveAnswers(input.submissionId, answerRecords);

    const grade = await this.gradeScales.gradeFor(input.schoolId, marked.percent);
    return this.results.upsertForSubmission({
      submissionId: input.submissionId,
      schoolId: input.schoolId,
      studentId: input.studentId,
      examId: input.examId,
      subjectId: exam?.subjectId ?? null,
      classId: submission.classId,
      score: marked.score,
      maxScore: marked.max_score,
      percent: marked.percent,
      grade,
      keyVersion: input.keyVersion ?? 1,
    });
  }

  /**
   * Store the school's total (API spec 15.1, `session.scored`). When it differs
   * from the cloud total for the same key version the cloud keeps its own score
   * and reports the mismatch for an audit entry.
   */
  async recordSchoolScore(
    schoolId: string,
    submissionId: string,
    input: RecordSchoolScoreInput,
  ): Promise<RecordSchoolScoreResult> {
    const submission = await this.submissions.findById(submissionId);
    if (!submission || submission.schoolId !== schoolId) return { mismatch: false, result: null };

    const result = await this.results.findBySubmissionId(submissionId);
    const mismatch =
      result !== null && Math.abs((submission.cloudScore ?? 0) - input.score) > 0.005;

    await this.submissions.update(submissionId, {
      schoolScore: input.score,
      cloudScore: result?.score ?? submission.cloudScore ?? null,
      keyVersion: input.keyVersion ?? submission.keyVersion,
      submittedAt: toDate(input.scoredAt) ?? submission.submittedAt,
    });

    return { mismatch, result };
  }

  /** Void a submission and remove its result from the review lists on reset. */
  async voidSubmission(schoolId: string, submissionId: string): Promise<boolean> {
    const submission = await this.submissions.findById(submissionId);
    if (!submission || submission.schoolId !== schoolId) return false;
    await this.submissions.voidById(submissionId);
    await this.results.deleteBySubmissionId(submissionId);
    return true;
  }

  async list(
    schoolId: string,
    filter: { examId?: string; classId?: string; status?: ResultStatus; studentId?: string },
  ): Promise<ResultListItem[]> {
    const rows = await this.results.list({
      schoolId,
      examId: filter.examId,
      classId: filter.classId,
      status: filter.status,
      studentId: filter.studentId,
    });
    const students = await this.directory.listStudents([...new Set(rows.map((row) => row.studentId))]);
    const byId = new Map(students.map((student) => [student.id, student]));
    return rows.map((row) => this.toListItem(row, byId.get(row.studentId) ?? null));
  }

  async getDetail(schoolId: string, resultId: string): Promise<ResultDetail> {
    const result = await this.results.findById(resultId);
    if (!result || result.schoolId !== schoolId) {
      throw new NotFoundException({ code: 'RESULT_NOT_FOUND', message: 'Result not found' });
    }
    const [submission, answers, student] = await Promise.all([
      this.submissions.findById(result.submissionId),
      this.submissions.listAnswers(result.submissionId),
      this.directory.getStudent(result.studentId),
    ]);
    const base = this.toListItem(result, student);
    return {
      ...base,
      submissionId: result.submissionId,
      submittedAt: submission?.submittedAt ?? null,
      submitReason: submission?.submitReason ?? null,
      focusLostCount: submission?.focusLostCount ?? 0,
      extraSeconds: submission?.extraSeconds ?? 0,
      answers: answers.map((answer) => ({
        questionId: answer.questionId,
        answer: answer.answer,
        marks: answer.cloudMarks ?? 0,
        maxMarks: answer.maxMarks ?? 0,
        flagged: answer.flagged,
      })),
    };
  }

  /** Mark draft results reviewed. */
  async reviewResults(
    schoolId: string,
    actorId: string,
    target: { resultIds?: string[]; examId?: string; classId?: string },
  ): Promise<ReviewSummary> {
    const results = await this.resolveTargets(schoolId, target);
    const reviewable = results.filter((result) => canReview(result.status));
    await this.results.bulkUpdate(
      reviewable.map((result) => result.id),
      { status: 'reviewed', reviewedBy: actorId, reviewedAt: new Date() },
    );
    return { reviewed: reviewable.length, skipped: results.length - reviewable.length };
  }

  /**
   * Release reviewed results (BR-14) and queue a score-free notification per
   * linked guardian with `can_view_results`.
   */
  async releaseResults(
    schoolId: string,
    actorId: string,
    target: { resultIds?: string[]; examId?: string; classId?: string },
    options: { notify?: boolean } = {},
  ): Promise<ReleaseResult> {
    const results = await this.resolveTargets(schoolId, target);
    if (results.length === 0) return { released: 0, notificationsQueued: 0 };

    const unreleased = results.filter((result) => result.status !== 'released');
    const notReviewed = unreleased.filter((result) => !canRelease(result.status));
    if (notReviewed.length > 0) {
      throw new ConflictException({
        code: 'RESULTS_NOT_REVIEWED',
        message: `${notReviewed.length} result(s) are not reviewed yet`,
        unreviewed: notReviewed.length,
      });
    }

    const toRelease = results.filter((result) => result.status !== 'released');
    await this.results.bulkUpdate(
      toRelease.map((result) => result.id),
      { status: 'released', releasedBy: actorId, releasedAt: new Date() },
    );

    let notificationsQueued = 0;
    if (options.notify !== false) {
      notificationsQueued = await this.queueReleaseNotifications(schoolId, toRelease);
    }
    return { released: toRelease.length, notificationsQueued };
  }

  /** Withdraw results; parents then see "under review". */
  async withdrawResults(
    schoolId: string,
    _actorId: string,
    target: { resultIds: string[]; reason?: string },
  ): Promise<WithdrawResult> {
    const results = await this.resolveTargets(schoolId, { resultIds: target.resultIds });
    const withdrawable = results.filter((result) => canWithdraw(result.status));
    await this.results.bulkUpdate(
      withdrawable.map((result) => result.id),
      { status: 'withdrawn', withdrawnReason: target.reason ?? null },
    );
    return { withdrawn: withdrawable.length };
  }

  // --- Key corrections & re-marking (API spec 9.3) -------------------------

  async previewKeyCorrection(
    schoolId: string,
    actorId: string,
    input: KeyCorrectionInput,
  ): Promise<KeyCorrectionPreview> {
    const exam = await this.directory.getExam(input.examId);
    if (!exam || exam.schoolId !== schoolId) {
      throw new NotFoundException({ code: 'EXAM_NOT_FOUND', message: 'Exam not found' });
    }
    const questions = await this.directory.listExamQuestions(input.examId);
    const target = questions.find((question) => question.questionId === input.questionId);
    if (!target) {
      throw new NotFoundException({ code: 'QUESTION_NOT_IN_EXAM', message: 'Question is not in this exam' });
    }

    const correctedKey = this.correctedKey(target, input);
    const changes = await this.computeRemarkChanges(schoolId, input.examId, input.questionId, correctedKey);

    const correction: RemarkCorrection = {
      ...(input.correctOptionIds ? { correctOptionIds: [...input.correctOptionIds] } : {}),
      ...(input.fillAnswers ? { fillAnswers: [...input.fillAnswers] } : {}),
      ...(input.caseSensitive !== undefined ? { caseSensitive: input.caseSensitive } : {}),
    };

    const run = await this.remarkRuns.create({
      schoolId,
      examId: input.examId,
      questionId: input.questionId,
      reason: input.reason,
      requestedBy: actorId,
      status: 'previewed',
      affected: changes.length,
      correction,
      preview: changes.slice(0, MAX_PREVIEW),
    });
    return { run, changes };
  }

  async getKeyCorrection(schoolId: string, runId: string): Promise<RemarkRunRecord> {
    const run = await this.remarkRuns.findById(runId);
    if (!run || run.schoolId !== schoolId) {
      throw new NotFoundException({ code: 'REMARK_RUN_NOT_FOUND', message: 'Key correction not found' });
    }
    return run;
  }

  async cancelKeyCorrection(schoolId: string, runId: string): Promise<RemarkRunRecord> {
    const run = await this.getKeyCorrection(schoolId, runId);
    if (run.status !== 'previewed') {
      throw new ConflictException({ code: 'REMARK_RUN_CLOSED', message: 'This key correction is already closed' });
    }
    return this.remarkRuns.update(runId, { status: 'cancelled' });
  }

  async applyKeyCorrection(
    schoolId: string,
    _actorId: string,
    runId: string,
    options: { notifyOnRemark?: boolean } = {},
  ): Promise<ApplyRemarkResult> {
    const run = await this.getKeyCorrection(schoolId, runId);
    if (run.status !== 'previewed') {
      throw new ConflictException({ code: 'REMARK_RUN_CLOSED', message: 'This key correction is already closed' });
    }
    const questions = await this.directory.listExamQuestions(run.examId);
    const target = questions.find((question) => question.questionId === run.questionId);
    if (!target) {
      throw new NotFoundException({ code: 'QUESTION_NOT_IN_EXAM', message: 'Question is not in this exam' });
    }

    const correctedKey = this.correctedKey(target, {
      examId: run.examId,
      questionId: run.questionId,
      reason: run.reason,
      ...(run.correction ?? {}),
    });
    const submissions = await this.submissions.list({ schoolId, examId: run.examId });
    const answers = await this.submissions.listAnswersForSubmissions(
      submissions.map((submission) => submission.id),
    );
    const answersBySubmission = groupBy(answers, (answer) => answer.submissionId);

    let applied = 0;
    let unchanged = 0;
    let notificationsQueued = 0;

    for (const submission of submissions) {
      const result = await this.results.findBySubmissionId(submission.id);
      if (!result) continue;
      const submissionAnswers = answersBySubmission.get(submission.id) ?? [];
      const answer = submissionAnswers.find((entry) => entry.questionId === run.questionId);
      const oldMarks = answer?.cloudMarks ?? 0;
      const newMarks = newAnswerMarks(correctedKey, answer?.answer ?? null);
      if (Math.abs(oldMarks - newMarks) < 0.005) {
        unchanged += 1;
        continue;
      }

      const newScore = round2(result.score - oldMarks + newMarks);
      const percent = percentOf(newScore, result.maxScore);
      const grade = gradeForPercent(percent, (await this.gradeScales.ensureDefault(schoolId)).bands);
      await this.results.update(result.id, {
        score: newScore,
        percent,
        grade,
        revision: result.revision + 1,
        updated: true,
      });
      applied += 1;

      if (result.status === 'released' && options.notifyOnRemark !== false) {
        notificationsQueued += await this.queueRemarkNotifications(schoolId, result.studentId, result.id);
      }
    }

    const updated = await this.remarkRuns.update(runId, {
      status: 'applied',
      appliedAt: new Date(),
      affected: applied,
    });
    return { applied, unchanged, notificationsQueued, appliedAt: updated.appliedAt };
  }

  // --- Reports -------------------------------------------------------------

  /** Structured class results sheet (the export encoders build the files). */
  async generateResultReport(schoolId: string, examId: string, classId?: string) {
    const exam = await this.directory.getExam(examId);
    if (!exam || exam.schoolId !== schoolId) {
      throw new NotFoundException({ code: 'EXAM_NOT_FOUND', message: 'Exam not found' });
    }
    const results = await this.results.list({ schoolId, examId, classId });
    const students = await this.directory.listStudents([...new Set(results.map((r) => r.studentId))]);
    const byId = new Map(students.map((student) => [student.id, student]));
    const builder = new BuildResultReport();
    return builder.build({
      exam: { id: exam.id, title: exam.title, subjectName: exam.subjectName, passMarkPct: exam.passMarkPct },
      classId: classId ?? null,
      rows: results.map((result) => ({
        studentId: result.studentId,
        studentName: byId.get(result.studentId)?.fullName ?? null,
        admissionNo: byId.get(result.studentId)?.admissionNo ?? null,
        score: result.score,
        maxScore: result.maxScore,
        percent: result.percent,
        grade: result.grade,
        status: result.status,
      })),
    });
  }

  /** A student's result history across exams (US-11.7). */
  async generateStudentReport(schoolId: string, studentId: string) {
    const student = await this.directory.getStudent(studentId);
    if (!student || student.schoolId !== schoolId) {
      throw new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: 'Student not found' });
    }
    const results = await this.results.list({ schoolId, studentId });
    const examIds = [...new Set(results.map((result) => result.examId))];
    const exams = new Map(
      (await Promise.all(examIds.map((examId) => this.directory.getExam(examId))))
        .filter((exam): exam is NonNullable<typeof exam> => exam !== null)
        .map((exam) => [exam.id, exam]),
    );
    return {
      student: {
        id: student.id,
        fullName: student.fullName,
        admissionNo: student.admissionNo,
      },
      generatedAt: new Date().toISOString(),
      rows: results.map((result) => ({
        resultId: result.id,
        examId: result.examId,
        examTitle: exams.get(result.examId)?.title ?? null,
        subject: exams.get(result.examId)?.subjectName ?? null,
        date: result.createdAt.toISOString().slice(0, 10),
        score: result.score,
        maxScore: result.maxScore,
        percent: result.percent,
        grade: result.grade,
        status: result.status,
      })),
    };
  }

  // --- internals -----------------------------------------------------------

  private async resolveTargets(
    schoolId: string,
    target: { resultIds?: string[]; examId?: string; classId?: string },
  ): Promise<ResultRecord[]> {
    if (target.resultIds && target.resultIds.length > 0) {
      const found = await Promise.all(target.resultIds.map((id) => this.results.findById(id)));
      const scoped = found.filter(
        (result): result is ResultRecord => result !== null && result.schoolId === schoolId,
      );
      if (scoped.length !== target.resultIds.length) {
        throw new NotFoundException({ code: 'RESULT_NOT_FOUND', message: 'One or more results were not found' });
      }
      return scoped;
    }
    if (!target.examId) {
      throw new BadRequestException({
        code: 'RESULT_TARGET_REQUIRED',
        message: 'Provide result_ids or an exam_id',
      });
    }
    return this.results.list({ schoolId, examId: target.examId, classId: target.classId });
  }

  private async queueReleaseNotifications(
    schoolId: string,
    results: ResultRecord[],
  ): Promise<number> {
    let queued = 0;
    for (const result of results) {
      queued += await this.queueRemarkNotifications(schoolId, result.studentId, result.id);
    }
    return queued;
  }

  private async queueRemarkNotifications(
    schoolId: string,
    studentId: string,
    resultId: string,
  ): Promise<number> {
    const links = await this.directory.listGuardianshipsByStudent(studentId);
    let queued = 0;
    for (const link of links) {
      if (!link.canViewResults) continue;
      const guardian = await this.directory.getGuardian(link.guardianId);
      if (!guardian) continue;
      await this.notifications.queueResultsReleased({ schoolId, guardian, studentId, resultId });
      queued += 1;
    }
    return queued;
  }

  private correctedKey(target: ExamQuestionKeyInfo, input: KeyCorrectionInput): PackQuestionKey {
    const base = target.key;
    if (base.type === 'single_choice' || base.type === 'true_false' || base.type === 'multi_choice') {
      if (!input.correctOptionIds || input.correctOptionIds.length === 0) {
        throw new BadRequestException({
          code: 'CORRECTION_INVALID',
          message: 'correct_option_ids is required for choice questions',
        });
      }
      return { ...base, correct_option_ids: [...input.correctOptionIds] };
    }
    if (base.type === 'fill_blank') {
      if (!input.fillAnswers || input.fillAnswers.length === 0) {
        throw new BadRequestException({
          code: 'CORRECTION_INVALID',
          message: 'fill_answers is required for fill-in-the-blank questions',
        });
      }
      return { ...base, fill: { answers: [...input.fillAnswers], case_sensitive: input.caseSensitive ?? false } };
    }
    throw new BadRequestException({
      code: 'CORRECTION_UNSUPPORTED',
      message: `Key corrections are not supported for ${base.type} questions`,
    });
  }

  private async computeRemarkChanges(
    schoolId: string,
    examId: string,
    questionId: string,
    correctedKey: PackQuestionKey,
  ): Promise<RemarkPreviewEntry[]> {
    const submissions = await this.submissions.list({ schoolId, examId });
    const answers = await this.submissions.listAnswersForSubmissions(
      submissions.map((submission) => submission.id),
    );
    const answersBySubmission = groupBy(answers, (answer) => answer.submissionId);
    const changes: RemarkPreviewEntry[] = [];

    for (const submission of submissions) {
      const result = await this.results.findBySubmissionId(submission.id);
      if (!result) continue;
      const answer = (answersBySubmission.get(submission.id) ?? []).find(
        (entry) => entry.questionId === questionId,
      );
      const oldMarks = answer?.cloudMarks ?? 0;
      const newMarks = newAnswerMarks(correctedKey, answer?.answer ?? null);
      if (Math.abs(oldMarks - newMarks) < 0.005) continue;
      changes.push({
        student_id: submission.studentId,
        old_score: round2(result.score),
        new_score: round2(result.score - oldMarks + newMarks),
      });
    }
    return changes;
  }

  private toListItem(
    row: ResultRecord,
    student: { fullName: string; admissionNo: string } | null,
  ): ResultListItem {
    return {
      id: row.id,
      student: {
        id: row.studentId,
        fullName: student?.fullName ?? null,
        admissionNo: student?.admissionNo ?? null,
      },
      examId: row.examId,
      classId: row.classId,
      score: row.score,
      maxScore: row.maxScore,
      percent: row.percent,
      grade: row.grade,
      status: row.status,
      revision: row.revision,
      updated: row.updated,
    };
  }
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

function newAnswerMarks(key: PackQuestionKey, answer: PackAnswerValue): number {
  // Re-mark a single question by rebuilding a one-question key map.
  const marked = markSubmission({ [keyMarker]: key }, { [keyMarker]: answer });
  return marked.score;
}

/** A stable placeholder id used to mark a single question in isolation. */
const keyMarker = '__question__';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
