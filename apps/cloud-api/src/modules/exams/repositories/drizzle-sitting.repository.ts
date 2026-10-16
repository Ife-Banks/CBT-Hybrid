import { Inject, Injectable } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { DrizzleService } from '../../../shared/database/drizzle.service';
import { sittings } from '@cbt/shared-types';
import type { SittingRepository } from './sitting.repository';
import type { SittingDomainRecord, CreateSittingDto, UpdateSittingDto } from '../domain/types';
import { mapSittingToDomain } from '../domain/mappers';
import crypto from 'node:crypto';

@Injectable()
export class DrizzleSittingRepository implements SittingRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async create(dto: CreateSittingDto, schoolId: string): Promise<SittingDomainRecord> {
    const id = crypto.randomUUID();
    const rows = await this.db
      .insert(sittings)
      .values({
        id,
        schoolId,
        examId: dto.examId,
        classId: dto.classId,
        windowStart: dto.windowStart,
        windowEnd: dto.windowEnd,
        extraTimeMin: dto.extraTimeMin ?? 0,
        status: 'scheduled',
      })
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to create sitting');
    }
    return mapSittingToDomain(row);
  }

  async findById(id: string): Promise<SittingDomainRecord | null> {
    const [row] = await this.db.select().from(sittings).where(eq(sittings.id, id)).limit(1);
    return row ? mapSittingToDomain(row) : null;
  }

  async findBySchoolId(schoolId: string): Promise<SittingDomainRecord[]> {
    const rows = await this.db
      .select()
      .from(sittings)
      .where(eq(sittings.schoolId, schoolId))
      .orderBy(desc(sittings.windowStart));
    return rows.map(mapSittingToDomain);
  }

  async findByExamId(examId: string): Promise<SittingDomainRecord[]> {
    const rows = await this.db
      .select()
      .from(sittings)
      .where(eq(sittings.examId, examId))
      .orderBy(desc(sittings.windowStart));
    return rows.map(mapSittingToDomain);
  }

  async findByClassId(classId: string): Promise<SittingDomainRecord[]> {
    const rows = await this.db
      .select()
      .from(sittings)
      .where(eq(sittings.classId, classId))
      .orderBy(desc(sittings.windowStart));
    return rows.map(mapSittingToDomain);
  }

  async update(id: string, dto: UpdateSittingDto): Promise<SittingDomainRecord> {
    const rows = await this.db
      .update(sittings)
      .set({
        ...(dto.windowStart !== undefined && { windowStart: dto.windowStart }),
        ...(dto.windowEnd !== undefined && { windowEnd: dto.windowEnd }),
        ...(dto.extraTimeMin !== undefined && { extraTimeMin: dto.extraTimeMin }),
        ...(dto.status !== undefined && { status: dto.status }),
      })
      .where(eq(sittings.id, id))
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to update sitting');
    }
    return mapSittingToDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(sittings).where(eq(sittings.id, id));
  }
}
