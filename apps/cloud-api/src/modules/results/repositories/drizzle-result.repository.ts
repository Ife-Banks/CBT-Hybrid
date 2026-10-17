import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray } from 'drizzle-orm';
import { results } from '@cbt/shared-types';
import { DrizzleService, type DrizzleDB } from '../../../shared/database/drizzle.service';
import { mapResultFromDb } from '../domain/mappers';
import type { ResultRecord, ResultStatus } from '../domain/types';
import type { CreateResultInput, ResultFilter, ResultRepository } from './result.repository';

function numeric(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

@Injectable()
export class DrizzleResultRepository implements ResultRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async create(input: CreateResultInput): Promise<ResultRecord> {
    const rows = await this.db
      .insert(results)
      .values(this.toInsert(input))
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Failed to create result');
    return mapResultFromDb(row);
  }

  async upsertForSubmission(input: CreateResultInput): Promise<ResultRecord> {
    const rows = await this.db
      .insert(results)
      .values(this.toInsert(input))
      .onConflictDoUpdate({
        target: results.submissionId,
        set: {
          score: numeric(input.score)!,
          maxScore: numeric(input.maxScore)!,
          percent: numeric(input.percent)!,
          grade: input.grade ?? null,
          keyVersion: input.keyVersion ?? 1,
          ...(input.subjectId !== undefined && { subjectId: input.subjectId }),
          ...(input.classId !== undefined && { classId: input.classId }),
          updatedAt: new Date(),
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Failed to upsert result');
    return mapResultFromDb(row);
  }

  async findById(id: string): Promise<ResultRecord | null> {
    const [row] = await this.db.select().from(results).where(eq(results.id, id)).limit(1);
    return row ? mapResultFromDb(row) : null;
  }

  async findBySubmissionId(submissionId: string): Promise<ResultRecord | null> {
    const [row] = await this.db
      .select()
      .from(results)
      .where(eq(results.submissionId, submissionId))
      .limit(1);
    return row ? mapResultFromDb(row) : null;
  }

  async list(filter: ResultFilter): Promise<ResultRecord[]> {
    const conditions = [eq(results.schoolId, filter.schoolId)];
    if (filter.examId) conditions.push(eq(results.examId, filter.examId));
    if (filter.classId) conditions.push(eq(results.classId, filter.classId));
    if (filter.studentId) conditions.push(eq(results.studentId, filter.studentId));
    const statuses = filter.statuses ?? (filter.status ? [filter.status] : undefined);
    if (statuses && statuses.length > 0) conditions.push(inArray(results.status, statuses));
    const rows = await this.db
      .select()
      .from(results)
      .where(and(...conditions));
    return rows.map(mapResultFromDb);
  }

  async update(
    id: string,
    patch: Partial<Omit<ResultRecord, 'id' | 'createdAt'>>,
  ): Promise<ResultRecord> {
    const rows = await this.db
      .update(results)
      .set({
        ...(patch.subjectId !== undefined && { subjectId: patch.subjectId }),
        ...(patch.classId !== undefined && { classId: patch.classId }),
        ...(patch.score !== undefined && { score: numeric(patch.score)! }),
        ...(patch.maxScore !== undefined && { maxScore: numeric(patch.maxScore)! }),
        ...(patch.percent !== undefined && { percent: numeric(patch.percent)! }),
        ...(patch.grade !== undefined && { grade: patch.grade }),
        ...(patch.keyVersion !== undefined && { keyVersion: patch.keyVersion }),
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.revision !== undefined && { revision: patch.revision }),
        ...(patch.reviewedBy !== undefined && { reviewedBy: patch.reviewedBy }),
        ...(patch.reviewedAt !== undefined && { reviewedAt: patch.reviewedAt }),
        ...(patch.releasedBy !== undefined && { releasedBy: patch.releasedBy }),
        ...(patch.releasedAt !== undefined && { releasedAt: patch.releasedAt }),
        ...(patch.withdrawnReason !== undefined && { withdrawnReason: patch.withdrawnReason }),
        ...(patch.teacherComment !== undefined && { teacherComment: patch.teacherComment }),
        ...(patch.updated !== undefined && { updated: patch.updated }),
        updatedAt: new Date(),
      })
      .where(eq(results.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error(`result ${id} not found`);
    return mapResultFromDb(row);
  }

  async bulkUpdate(
    ids: string[],
    patch: Partial<Omit<ResultRecord, 'id' | 'createdAt'>>,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await this.db
      .update(results)
      .set({
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.reviewedBy !== undefined && { reviewedBy: patch.reviewedBy }),
        ...(patch.reviewedAt !== undefined && { reviewedAt: patch.reviewedAt }),
        ...(patch.releasedBy !== undefined && { releasedBy: patch.releasedBy }),
        ...(patch.releasedAt !== undefined && { releasedAt: patch.releasedAt }),
        ...(patch.withdrawnReason !== undefined && { withdrawnReason: patch.withdrawnReason }),
        ...(patch.updated !== undefined && { updated: patch.updated }),
        updatedAt: new Date(),
      })
      .where(inArray(results.id, ids))
      .returning({ id: results.id });
    return rows.length;
  }

  async deleteBySubmissionId(submissionId: string): Promise<number> {
    const rows = await this.db
      .delete(results)
      .where(eq(results.submissionId, submissionId))
      .returning({ id: results.id });
    return rows.length;
  }

  async countByStatus(schoolId: string, status: ResultStatus): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(results)
      .where(and(eq(results.schoolId, schoolId), eq(results.status, status)));
    return Number(row?.value ?? 0);
  }

  private toInsert(input: CreateResultInput) {
    return {
      ...(input.id ? { id: input.id } : {}),
      submissionId: input.submissionId,
      schoolId: input.schoolId,
      studentId: input.studentId,
      examId: input.examId,
      subjectId: input.subjectId ?? null,
      classId: input.classId ?? null,
      score: numeric(input.score)!,
      maxScore: numeric(input.maxScore)!,
      percent: numeric(input.percent)!,
      grade: input.grade ?? null,
      keyVersion: input.keyVersion ?? 1,
      status: input.status ?? ('draft' as const),
      revision: input.revision ?? 1,
    };
  }
}
