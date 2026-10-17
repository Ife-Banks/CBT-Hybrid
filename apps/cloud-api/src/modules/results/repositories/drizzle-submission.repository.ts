import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { submissionAnswers, submissions } from '@cbt/shared-types';
import { DrizzleService, type DrizzleDB } from '../../../shared/database/drizzle.service';
import { mapSubmissionAnswerFromDb, mapSubmissionFromDb } from '../domain/mappers';
import type { SubmissionAnswerRecord, SubmissionRecord } from '../domain/types';
import type {
  SubmissionFilter,
  SubmissionRepository,
  UpsertSubmissionInput,
} from './submission.repository';

/** `numeric` columns take strings; convert a number or null. */
function numeric(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

@Injectable()
export class DrizzleSubmissionRepository implements SubmissionRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async findById(id: string): Promise<SubmissionRecord | null> {
    const [row] = await this.db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
    return row ? mapSubmissionFromDb(row) : null;
  }

  async findBySittingAndStudent(
    sittingId: string,
    studentId: string,
  ): Promise<SubmissionRecord | null> {
    const [row] = await this.db
      .select()
      .from(submissions)
      .where(and(eq(submissions.sittingId, sittingId), eq(submissions.studentId, studentId)))
      .limit(1);
    return row ? mapSubmissionFromDb(row) : null;
  }

  async upsert(input: UpsertSubmissionInput): Promise<SubmissionRecord> {
    const now = new Date();
    const rows = await this.db
      .insert(submissions)
      .values({
        id: input.id,
        schoolId: input.schoolId,
        sittingId: input.sittingId,
        studentId: input.studentId,
        examId: input.examId,
        classId: input.classId ?? null,
        packVersion: input.packVersion,
        keyVersion: input.keyVersion ?? 1,
        seat: input.seat ?? null,
        startedAt: input.startedAt ?? null,
        submittedAt: input.submittedAt ?? null,
        submitReason: input.submitReason ?? null,
        schoolScore: numeric(input.schoolScore),
        cloudScore: numeric(input.cloudScore),
        focusLostCount: input.focusLostCount ?? 0,
        extraSeconds: input.extraSeconds ?? 0,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: submissions.id,
        set: {
          classId: input.classId ?? null,
          packVersion: input.packVersion,
          ...(input.keyVersion !== undefined && { keyVersion: input.keyVersion }),
          ...(input.seat !== undefined && { seat: input.seat }),
          ...(input.startedAt !== undefined && { startedAt: input.startedAt }),
          ...(input.submittedAt !== undefined && { submittedAt: input.submittedAt }),
          ...(input.submitReason !== undefined && { submitReason: input.submitReason }),
          ...(input.schoolScore !== undefined && { schoolScore: numeric(input.schoolScore) }),
          ...(input.cloudScore !== undefined && { cloudScore: numeric(input.cloudScore) }),
          ...(input.focusLostCount !== undefined && { focusLostCount: input.focusLostCount }),
          ...(input.extraSeconds !== undefined && { extraSeconds: input.extraSeconds }),
          updatedAt: now,
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Failed to upsert submission');
    return mapSubmissionFromDb(row);
  }

  async update(
    id: string,
    patch: Partial<Omit<SubmissionRecord, 'id' | 'schoolId' | 'createdAt'>>,
  ): Promise<SubmissionRecord> {
    const rows = await this.db
      .update(submissions)
      .set({
        ...(patch.classId !== undefined && { classId: patch.classId }),
        ...(patch.keyVersion !== undefined && { keyVersion: patch.keyVersion }),
        ...(patch.seat !== undefined && { seat: patch.seat }),
        ...(patch.startedAt !== undefined && { startedAt: patch.startedAt }),
        ...(patch.submittedAt !== undefined && { submittedAt: patch.submittedAt }),
        ...(patch.submitReason !== undefined && { submitReason: patch.submitReason }),
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.schoolScore !== undefined && { schoolScore: numeric(patch.schoolScore) }),
        ...(patch.cloudScore !== undefined && { cloudScore: numeric(patch.cloudScore) }),
        ...(patch.focusLostCount !== undefined && { focusLostCount: patch.focusLostCount }),
        ...(patch.extraSeconds !== undefined && { extraSeconds: patch.extraSeconds }),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error(`submission ${id} not found`);
    return mapSubmissionFromDb(row);
  }

  async voidById(id: string): Promise<SubmissionRecord | null> {
    const rows = await this.db
      .update(submissions)
      .set({ status: 'voided', updatedAt: new Date() })
      .where(eq(submissions.id, id))
      .returning();
    const row = rows[0];
    return row ? mapSubmissionFromDb(row) : null;
  }

  async saveAnswers(submissionId: string, answers: SubmissionAnswerRecord[]): Promise<void> {
    if (answers.length === 0) return;
    await this.db
      .insert(submissionAnswers)
      .values(
        answers.map((answer) => ({
          submissionId,
          questionId: answer.questionId,
          answer: answer.answer,
          flagged: answer.flagged,
          seq: answer.seq,
          answeredAt: answer.answeredAt,
          cloudMarks: numeric(answer.cloudMarks),
          maxMarks: numeric(answer.maxMarks),
        })),
      )
      .onConflictDoUpdate({
        target: [submissionAnswers.submissionId, submissionAnswers.questionId],
        set: {
          answer: sql`excluded.answer`,
          flagged: sql`excluded.flagged`,
        },
      });
  }

  async listAnswers(submissionId: string): Promise<SubmissionAnswerRecord[]> {
    const rows = await this.db
      .select()
      .from(submissionAnswers)
      .where(eq(submissionAnswers.submissionId, submissionId));
    return rows.map(mapSubmissionAnswerFromDb);
  }

  async listAnswersForSubmissions(submissionIds: string[]): Promise<SubmissionAnswerRecord[]> {
    if (submissionIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(submissionAnswers)
      .where(inArray(submissionAnswers.submissionId, submissionIds));
    return rows.map(mapSubmissionAnswerFromDb);
  }

  async list(filter: SubmissionFilter): Promise<SubmissionRecord[]> {
    const conditions = [eq(submissions.schoolId, filter.schoolId)];
    if (filter.examId) conditions.push(eq(submissions.examId, filter.examId));
    if (filter.classId) conditions.push(eq(submissions.classId, filter.classId));
    if (filter.studentId) conditions.push(eq(submissions.studentId, filter.studentId));
    if (filter.sittingId) conditions.push(eq(submissions.sittingId, filter.sittingId));
    if (filter.status) conditions.push(eq(submissions.status, filter.status));
    const rows = await this.db
      .select()
      .from(submissions)
      .where(and(...conditions));
    return rows.map(mapSubmissionFromDb);
  }
}
