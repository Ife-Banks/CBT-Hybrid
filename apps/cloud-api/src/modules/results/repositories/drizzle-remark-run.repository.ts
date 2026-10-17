import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { remarkRuns } from '@cbt/shared-types';
import { DrizzleService, type DrizzleDB } from '../../../shared/database/drizzle.service';
import { mapRemarkRunFromDb } from '../domain/mappers';
import type { RemarkRunRecord } from '../domain/types';
import type { CreateRemarkRunInput, RemarkRunRepository } from './remark-run.repository';

@Injectable()
export class DrizzleRemarkRunRepository implements RemarkRunRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async create(input: CreateRemarkRunInput): Promise<RemarkRunRecord> {
    const rows = await this.db
      .insert(remarkRuns)
      .values({
        ...(input.id ? { id: input.id } : {}),
        schoolId: input.schoolId,
        examId: input.examId,
        questionId: input.questionId,
        newQuestionId: input.newQuestionId ?? null,
        reason: input.reason,
        requestedBy: input.requestedBy,
        status: input.status ?? 'previewed',
        affected: input.affected ?? 0,
        newKeyVersion: input.newKeyVersion ?? null,
        correction: input.correction ?? null,
        preview: input.preview ?? null,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Failed to create remark run');
    return mapRemarkRunFromDb(row);
  }

  async findById(id: string): Promise<RemarkRunRecord | null> {
    const [row] = await this.db.select().from(remarkRuns).where(eq(remarkRuns.id, id)).limit(1);
    return row ? mapRemarkRunFromDb(row) : null;
  }

  async listByExam(examId: string): Promise<RemarkRunRecord[]> {
    const rows = await this.db
      .select()
      .from(remarkRuns)
      .where(eq(remarkRuns.examId, examId))
      .orderBy(desc(remarkRuns.createdAt));
    return rows.map(mapRemarkRunFromDb);
  }

  async update(
    id: string,
    patch: Partial<Omit<RemarkRunRecord, 'id' | 'createdAt'>>,
  ): Promise<RemarkRunRecord> {
    const rows = await this.db
      .update(remarkRuns)
      .set({
        ...(patch.newQuestionId !== undefined && { newQuestionId: patch.newQuestionId }),
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.affected !== undefined && { affected: patch.affected }),
        ...(patch.newKeyVersion !== undefined && { newKeyVersion: patch.newKeyVersion }),
        ...(patch.correction !== undefined && { correction: patch.correction }),
        ...(patch.preview !== undefined && { preview: patch.preview }),
        ...(patch.appliedAt !== undefined && { appliedAt: patch.appliedAt }),
      })
      .where(eq(remarkRuns.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error(`remark run ${id} not found`);
    return mapRemarkRunFromDb(row);
  }
}
