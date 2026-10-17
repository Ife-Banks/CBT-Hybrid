import type {
  AnswerChange,
  AnswerRecord,
  OutboxEventRecord,
  ResultRecord,
  SessionRecord,
  SubmitReason,
} from '../domain/types';

/** Injection token for the session repository. */
export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

/** Exam sessions, their answers and their results (API spec section 16). */
export interface SessionRepository {
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;

  /** The live session for a student in one sitting, if any. */
  findInProgressBySittingAndStudent(
    sittingId: string,
    studentId: string,
  ): Promise<SessionRecord | null>;

  /** Any live session on a seat, regardless of student. */
  findInProgressBySeat(seat: string): Promise<SessionRecord | null>;

  /** A submitted session for this student and exam (BR-10). */
  findSubmittedForStudentExam(studentId: string, examId: string): Promise<SessionRecord | null>;

  create(record: SessionRecord): Promise<SessionRecord>;
  /** Rotate the session token (student moved PC or recovered a frozen one). */
  rotateToken(id: string, tokenHash: string, at: string, ip: string | null): Promise<void>;
  touch(id: string, at: string, ip: string | null): Promise<void>;

  listAnswers(sessionId: string): Promise<AnswerRecord[]>;
  /**
   * Upsert a batch of answer changes and advance `last_seq`. The `answers`
   * trigger drops writes whose `seq` is not newer, so this is idempotent and
   * safe against out-of-order auto-saves. Returns the acknowledged seq.
   */
  saveAnswers(
    sessionId: string,
    changes: readonly AnswerChange[],
    seq: number,
    at: string,
  ): Promise<number>;

  /**
   * Finish a session in one transaction (API spec 16.8): store any final answer
   * changes, set `status = submitted`, save the result and queue the sync
   * events. A power cut therefore cannot leave a submitted session unscored.
   */
  completeSession(input: {
    sessionId: string;
    submittedAt: string;
    reason: SubmitReason;
    seq: number;
    changes: readonly AnswerChange[];
    result: ResultRecord;
    events: readonly OutboxEventRecord[];
  }): Promise<void>;

  /** In-progress sessions whose `ends_at` has passed (server-side expiry). */
  listExpired(now: string): Promise<SessionRecord[]>;
  /** In-progress sessions whose sitting window has closed. */
  listPastWindowEnd(now: string): Promise<SessionRecord[]>;

  /** Increment focus_lost_count for a session (Section 16.10). */
  incrementFocusLostCount(sessionId: string): Promise<void>;

  /** Insert a session event (focus_lost, focus_regained). */
  insertSessionEvent(input: {
    sessionId: string;
    type: string;
    at: string;
  }): Promise<void>;

  /** Find a session by its ID. */
  findById(id: string): Promise<SessionRecord | null>;
}
