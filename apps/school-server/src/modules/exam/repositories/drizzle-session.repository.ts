import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lte, sql } from 'drizzle-orm';
import { DrizzleSqliteService } from '../../../shared/database/drizzle-sqlite.service';
import type { SqliteDB } from '../../../shared/database/drizzle-sqlite.service';
import { answers, examSessions, outbox, results, sittings, sessionEvents } from '../../../shared/database/schema';
import { toAnswerRecord, toSessionRecord } from '../domain/mappers';
import type {
  AnswerChange,
  AnswerRecord,
  OutboxEventRecord,
  ResultRecord,
  SessionRecord,
  SubmitReason,
} from '../domain/types';
import type { SessionRepository } from './session.repository';

@Injectable()
export class DrizzleSessionRepository implements SessionRepository {
  constructor(@Inject(DrizzleSqliteService) private readonly drizzle: DrizzleSqliteService) {}

  private get db(): SqliteDB {
    return this.drizzle.getDb();
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const rows = await this.db
      .select()
      .from(examSessions)
      .where(eq(examSessions.tokenHash, tokenHash))
      .limit(1);
    return rows[0] ? toSessionRecord(rows[0]) : null;
  }

  async findInProgressBySittingAndStudent(
    sittingId: string,
    studentId: string,
  ): Promise<SessionRecord | null> {
    const rows = await this.db
      .select()
      .from(examSessions)
      .where(
        and(
          eq(examSessions.sittingId, sittingId),
          eq(examSessions.studentId, studentId),
          eq(examSessions.status, 'in_progress'),
        ),
      )
      .limit(1);
    return rows[0] ? toSessionRecord(rows[0]) : null;
  }

  async findInProgressBySeat(seat: string): Promise<SessionRecord | null> {
    const rows = await this.db
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.seat, seat), eq(examSessions.status, 'in_progress')))
      .limit(1);
    return rows[0] ? toSessionRecord(rows[0]) : null;
  }

  async findSubmittedForStudentExam(
    studentId: string,
    examId: string,
  ): Promise<SessionRecord | null> {
    const rows = await this.db
      .select({ session: examSessions })
      .from(examSessions)
      .innerJoin(sittings, eq(examSessions.sittingId, sittings.id))
      .where(
        and(
          eq(examSessions.studentId, studentId),
          eq(sittings.examId, examId),
          eq(examSessions.status, 'submitted'),
        ),
      )
      .limit(1);
    return rows[0] ? toSessionRecord(rows[0].session) : null;
  }

  async create(record: SessionRecord): Promise<SessionRecord> {
    await this.db.insert(examSessions).values({
      id: record.id,
      sittingId: record.sittingId,
      studentId: record.studentId,
      seat: record.seat,
      tokenHash: record.tokenHash,
      seed: record.seed,
      startedAt: record.startedAt,
      endsAt: record.endsAt,
      status: record.status,
      submittedAt: record.submittedAt,
      submitReason: record.submitReason,
      lastSeq: record.lastSeq,
      focusLostCount: record.focusLostCount,
      lastSeenAt: record.lastSeenAt,
      lastIp: record.lastIp,
    });
    return record;
  }

  async rotateToken(
    id: string,
    tokenHash: string,
    at: string,
    ip: string | null,
  ): Promise<void> {
    await this.db
      .update(examSessions)
      .set({ tokenHash, lastSeenAt: at, lastIp: ip })
      .where(eq(examSessions.id, id));
  }

  async touch(id: string, at: string, ip: string | null): Promise<void> {
    await this.db
      .update(examSessions)
      .set({ lastSeenAt: at, lastIp: ip })
      .where(eq(examSessions.id, id));
  }

  async listAnswers(sessionId: string): Promise<AnswerRecord[]> {
    const rows = await this.db
      .select()
      .from(answers)
      .where(eq(answers.sessionId, sessionId));
    return rows.map(toAnswerRecord);
  }

  async saveAnswers(
    sessionId: string,
    changes: readonly AnswerChange[],
    seq: number,
    at: string,
  ): Promise<number> {
    const db = this.db;
    // better-sqlite3 transactions are synchronous and commit before returning,
    // which is what API spec 16.6 requires for an acknowledged answer.
    return db.transaction((tx) => {
      for (const change of changes) {
        const payload = JSON.stringify({ answer: change.answer, flagged: change.flagged });
        tx.insert(answers)
          .values({
            sessionId,
            questionId: change.questionId,
            answerJson: payload,
            seq,
            savedAt: at,
          })
          .onConflictDoUpdate({
            target: [answers.sessionId, answers.questionId],
            set: { answerJson: payload, seq, savedAt: at },
          })
          .run();
      }

      const current = tx
        .select({ lastSeq: examSessions.lastSeq })
        .from(examSessions)
        .where(eq(examSessions.id, sessionId))
        .get();
      const acknowledged = Math.max(current?.lastSeq ?? 0, seq);
      if (acknowledged !== (current?.lastSeq ?? 0)) {
        tx.update(examSessions)
          .set({ lastSeq: acknowledged, lastSeenAt: at })
          .where(eq(examSessions.id, sessionId))
          .run();
      } else {
        tx.update(examSessions)
          .set({ lastSeenAt: at })
          .where(eq(examSessions.id, sessionId))
          .run();
      }
      return acknowledged;
    });
  }

  async completeSession(input: {
    sessionId: string;
    submittedAt: string;
    reason: SubmitReason;
    seq: number;
    changes: readonly AnswerChange[];
    result: ResultRecord;
    events: readonly OutboxEventRecord[];
  }): Promise<void> {
    const db = this.db;
    // One synchronous better-sqlite3 transaction, committed before it returns
    // (API spec 16.8). `synchronous = FULL` means this is durable.
    db.transaction((tx) => {
      for (const change of input.changes) {
        const payload = JSON.stringify({ answer: change.answer, flagged: change.flagged });
        tx.insert(answers)
          .values({
            sessionId: input.sessionId,
            questionId: change.questionId,
            answerJson: payload,
            seq: input.seq,
            savedAt: input.submittedAt,
          })
          .onConflictDoUpdate({
            target: [answers.sessionId, answers.questionId],
            set: { answerJson: payload, seq: input.seq, savedAt: input.submittedAt },
          })
          .run();
      }

      const current = tx
        .select({ lastSeq: examSessions.lastSeq })
        .from(examSessions)
        .where(eq(examSessions.id, input.sessionId))
        .get();
      const lastSeq = Math.max(current?.lastSeq ?? 0, input.seq);

      tx.update(examSessions)
        .set({
          status: 'submitted',
          submittedAt: input.submittedAt,
          submitReason: input.reason,
          lastSeq,
        })
        .where(eq(examSessions.id, input.sessionId))
        .run();

      tx.insert(results)
        .values({
          sessionId: input.result.sessionId,
          score: input.result.score,
          maxScore: input.result.maxScore,
          percent: input.result.percent,
          grade: input.result.grade,
          scoredAt: input.result.scoredAt,
        })
        .onConflictDoUpdate({
          target: results.sessionId,
          set: {
            score: input.result.score,
            maxScore: input.result.maxScore,
            percent: input.result.percent,
            grade: input.result.grade,
            scoredAt: input.result.scoredAt,
          },
        })
        .run();

      for (const event of input.events) {
        tx.insert(outbox)
          .values({
            eventId: event.eventId,
            type: event.type,
            payloadJson: JSON.stringify(event.payload),
            createdAt: event.createdAt,
            attempts: 0,
          })
          .run();
      }
    });
  }

  async listExpired(now: string): Promise<SessionRecord[]> {
    const rows = await this.db
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.status, 'in_progress'), lte(examSessions.endsAt, now)));
    return rows.map(toSessionRecord);
  }

  async listPastWindowEnd(now: string): Promise<SessionRecord[]> {
    const rows = await this.db
      .select({ session: examSessions })
      .from(examSessions)
      .innerJoin(sittings, eq(examSessions.sittingId, sittings.id))
      .where(and(eq(examSessions.status, 'in_progress'), lte(sittings.windowEnd, now)));
    return rows.map((row) => toSessionRecord(row.session));
  }

  async incrementFocusLostCount(sessionId: string): Promise<void> {
    await this.db
      .update(examSessions)
      .set({ focusLostCount: sql`${examSessions.focusLostCount} + 1` })
      .where(eq(examSessions.id, sessionId));
  }

  async insertSessionEvent(input: {
    sessionId: string;
    type: string;
    at: string;
  }): Promise<void> {
    await this.db.insert(sessionEvents).values({
      sessionId: input.sessionId,
      type: input.type,
      at: input.at,
    });
  }
}
