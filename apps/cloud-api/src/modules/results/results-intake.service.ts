import { Inject, Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { PackAnswerValue } from '@cbt/exam-core';
import { ResultsService } from './results.service';
import {
  RESULTS_DIRECTORY,
  SUBMISSION_REPOSITORY,
  type DirectoryRepository,
  type SubmissionRepository,
} from './repositories';

/** One outbox event as the school server sends it (API spec 13.7 / 15). */
export interface SyncEvent {
  event_id: string;
  payload?: unknown;
  created_at?: string;
}

export type IntakeOutcomeName = 'accepted' | 'duplicate' | 'rejected';

export interface IntakeOutcome {
  event_id: string;
  outcome: IntakeOutcomeName;
  code?: string;
  message?: string;
}

/**
 * Applies school-server outbox events to the cloud results store (API spec
 * 15.1). Processing is idempotent per `event_id`, and events for one session may
 * arrive in any order within a batch.
 */
@Injectable()
export class ResultsIntakeService {
  private readonly logger = new Logger(ResultsIntakeService.name);
  private readonly seen = new Set<string>();

  constructor(
    private readonly results: ResultsService,
    @Inject(SUBMISSION_REPOSITORY) private readonly submissions: SubmissionRepository,
    @Inject(RESULTS_DIRECTORY) private readonly directory: DirectoryRepository,
  ) {}

  async processBatch(type: string, events: SyncEvent[]): Promise<IntakeOutcome[]> {
    const outcomes: IntakeOutcome[] = [];
    for (const event of events) {
      if (this.seen.has(event.event_id)) {
        outcomes.push({ event_id: event.event_id, outcome: 'duplicate' });
        continue;
      }
      const outcome = await this.processEvent(type, event);
      if (outcome.outcome !== 'rejected') this.seen.add(event.event_id);
      outcomes.push(outcome);
    }
    return outcomes;
  }

  private async processEvent(type: string, event: SyncEvent): Promise<IntakeOutcome> {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    try {
      switch (type) {
        case 'session.started':
          return await this.onSessionStarted(event.event_id, payload);
        case 'session.submitted':
          return await this.onSessionSubmitted(event.event_id, payload);
        case 'session.scored':
          return await this.onSessionScored(event.event_id, payload);
        case 'session.reset':
          return await this.onSessionReset(event.event_id, payload);
        default:
          // sitting.opened / sitting.closed and any future type are acknowledged
          // without a local side effect so a school does not retry them.
          return { event_id: event.event_id, outcome: 'accepted' };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process ${type} ${event.event_id}: ${message}`);
      return { event_id: event.event_id, outcome: 'rejected', code: 'PAYLOAD_INVALID', message };
    }
  }

  private async onSessionStarted(
    eventId: string,
    payload: Record<string, unknown>,
  ): Promise<IntakeOutcome> {
    const sessionId = str(payload.session_id);
    const sittingId = str(payload.sitting_id);
    const studentId = str(payload.student_id);
    const examId = str(payload.exam_id);
    if (!sessionId || !sittingId || !studentId || !examId) {
      return reject(eventId, 'PAYLOAD_INVALID', 'session.started requires session, sitting, student and exam ids');
    }
    const sitting = await this.directory.getSitting(sittingId);
    if (!sitting) return reject(eventId, 'SITTING_UNKNOWN', 'Sitting is not in this school');

    await this.submissions.upsert({
      id: sessionId,
      schoolId: sitting.schoolId,
      sittingId,
      studentId,
      examId,
      classId: sitting.classId,
      packVersion: number(payload.pack_version) ?? 1,
      seat: str(payload.seat),
      startedAt: date(payload.started_at),
    });
    return { event_id: eventId, outcome: 'accepted' };
  }

  private async onSessionSubmitted(
    eventId: string,
    payload: Record<string, unknown>,
  ): Promise<IntakeOutcome> {
    const sessionId = str(payload.session_id);
    const sittingId = str(payload.sitting_id);
    const studentId = str(payload.student_id);
    const examId = str(payload.exam_id);
    if (!sessionId || !sittingId || !studentId || !examId) {
      return reject(eventId, 'PAYLOAD_INVALID', 'session.submitted is missing required ids');
    }
    const sitting = await this.directory.getSitting(sittingId);
    if (!sitting) return reject(eventId, 'SITTING_UNKNOWN', 'Sitting is not in this school');

    const answers = Array.isArray(payload.answers) ? payload.answers : [];
    await this.results.processSubmission({
      submissionId: sessionId,
      schoolId: sitting.schoolId,
      sittingId,
      studentId,
      examId,
      classId: sitting.classId,
      packVersion: number(payload.pack_version) ?? 1,
      keyVersion: number(payload.key_version) ?? 1,
      seat: str(payload.seat),
      startedAt: date(payload.started_at),
      submittedAt: date(payload.submitted_at) ?? new Date(),
      submitReason: str(payload.submit_reason),
      focusLostCount: number((payload.integrity as Record<string, unknown>)?.focus_lost_count) ?? 0,
      extraSeconds: number(payload.extra_seconds) ?? 0,
      answers: answers.map((raw) => {
        const answer = raw as Record<string, unknown>;
        return {
          question_id: String(answer.question_id),
          answer: (answer.answer ?? null) as PackAnswerValue,
          flagged: Boolean(answer.flagged),
          seq: number(answer.seq) ?? 0,
          answered_at: date(answer.answered_at),
        };
      }),
    });
    return { event_id: eventId, outcome: 'accepted' };
  }

  private async onSessionScored(
    eventId: string,
    payload: Record<string, unknown>,
  ): Promise<IntakeOutcome> {
    const sessionId = str(payload.session_id);
    if (!sessionId) return reject(eventId, 'PAYLOAD_INVALID', 'session.scored requires session_id');
    const submission = await this.submissions.findById(sessionId);
    if (!submission) return reject(eventId, 'SESSION_UNKNOWN', 'No submission for this session yet');

    await this.results.recordSchoolScore(submission.schoolId, sessionId, {
      score: number(payload.score) ?? 0,
      maxScore: number(payload.max_score) ?? 0,
      keyVersion: number(payload.key_version) ?? submission.keyVersion,
      scoredAt: date(payload.scored_at),
    });
    return { event_id: eventId, outcome: 'accepted' };
  }

  private async onSessionReset(
    eventId: string,
    payload: Record<string, unknown>,
  ): Promise<IntakeOutcome> {
    const sessionId = str(payload.session_id);
    if (!sessionId) return reject(eventId, 'PAYLOAD_INVALID', 'session.reset requires session_id');
    const submission = await this.submissions.findById(sessionId);
    if (!submission) return { event_id: eventId, outcome: 'accepted' };
    await this.results.voidSubmission(submission.schoolId, sessionId);
    return { event_id: eventId, outcome: 'accepted' };
  }

  /** Clear the idempotency buffer (tests / demo reset). */
  reset(): void {
    this.seen.clear();
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function date(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function reject(eventId: string, code: string, message: string): IntakeOutcome {
  return { event_id: eventId, outcome: 'rejected', code, message };
}
