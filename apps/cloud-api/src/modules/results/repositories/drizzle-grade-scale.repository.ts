import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { gradeScales } from '@cbt/shared-types';
import { DrizzleService, type DrizzleDB } from '../../../shared/database/drizzle.service';
import { mapGradeScaleFromDb } from '../domain/mappers';
import type { GradeScaleRecord } from '../domain/types';
import type {
  CreateGradeScaleInput,
  GradeScaleRepository,
  UpdateGradeScaleInput,
} from './grade-scale.repository';

@Injectable()
export class DrizzleGradeScaleRepository implements GradeScaleRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async findById(id: string): Promise<GradeScaleRecord | null> {
    const [row] = await this.db.select().from(gradeScales).where(eq(gradeScales.id, id)).limit(1);
    return row ? mapGradeScaleFromDb(row) : null;
  }

  async findDefaultForSchool(schoolId: string): Promise<GradeScaleRecord | null> {
    const [row] = await this.db
      .select()
      .from(gradeScales)
      .where(and(eq(gradeScales.schoolId, schoolId), eq(gradeScales.isDefault, true)))
      .limit(1);
    return row ? mapGradeScaleFromDb(row) : null;
  }

  async listBySchool(schoolId: string): Promise<GradeScaleRecord[]> {
    const rows = await this.db
      .select()
      .from(gradeScales)
      .where(eq(gradeScales.schoolId, schoolId));
    return rows.map(mapGradeScaleFromDb);
  }

  async create(input: CreateGradeScaleInput): Promise<GradeScaleRecord> {
    const isDefault = input.isDefault ?? false;
    if (isDefault) await this.clearDefault(input.schoolId);
    const rows = await this.db
      .insert(gradeScales)
      .values({
        ...(input.id ? { id: input.id } : {}),
        schoolId: input.schoolId,
        name: input.name,
        bands: input.bands,
        isDefault,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Failed to create grade scale');
    return mapGradeScaleFromDb(row);
  }

  async update(id: string, input: UpdateGradeScaleInput): Promise<GradeScaleRecord> {
    if (input.isDefault) {
      const existing = await this.findById(id);
      if (existing) await this.clearDefault(existing.schoolId);
    }
    const rows = await this.db
      .update(gradeScales)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.bands !== undefined && { bands: input.bands }),
        ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
        updatedAt: new Date(),
      })
      .where(eq(gradeScales.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error(`grade scale ${id} not found`);
    return mapGradeScaleFromDb(row);
  }

  private async clearDefault(schoolId: string): Promise<void> {
    await this.db
      .update(gradeScales)
      .set({ isDefault: false })
      .where(and(eq(gradeScales.schoolId, schoolId), eq(gradeScales.isDefault, true)));
  }
}
