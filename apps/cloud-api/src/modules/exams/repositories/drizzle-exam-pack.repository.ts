import { Inject, Injectable } from '@nestjs/common';
import { eq, desc, sql } from 'drizzle-orm';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { DrizzleService } from '../../../shared/database/drizzle.service';
import { examPacks } from '@cbt/shared-types';
import type { ExamPackRepository } from './exam-pack.repository';
import type { ExamPackDomainRecord, CreateExamPackDto } from '../domain/types';
import { mapExamPackToDomain } from '../domain/mappers';

@Injectable()
export class DrizzleExamPackRepository implements ExamPackRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async create(dto: CreateExamPackDto): Promise<ExamPackDomainRecord> {
    const rows = await this.db
      .insert(examPacks)
      .values({
        examId: dto.examId,
        version: dto.version,
        keyVersion: dto.keyVersion ?? 1,
        manifest: dto.manifest,
        storageKey: dto.storageKey,
        sizeBytes: dto.sizeBytes,
        sha256: dto.sha256,
        signature: dto.signature,
      })
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to create exam pack');
    }
    return mapExamPackToDomain(row);
  }

  async findById(id: string): Promise<ExamPackDomainRecord | null> {
    const [row] = await this.db.select().from(examPacks).where(eq(examPacks.id, id)).limit(1);
    return row ? mapExamPackToDomain(row) : null;
  }

  async findByExamId(examId: string): Promise<ExamPackDomainRecord[]> {
    const rows = await this.db
      .select()
      .from(examPacks)
      .where(eq(examPacks.examId, examId))
      .orderBy(desc(examPacks.version));
    return rows.map(mapExamPackToDomain);
  }

  async findByExamAndVersion(examId: string, version: number): Promise<ExamPackDomainRecord | null> {
    const [row] = await this.db
      .select()
      .from(examPacks)
      .where(sql`${examPacks.examId} = ${examId} and ${examPacks.version} = ${version}`)
      .limit(1);
    return row ? mapExamPackToDomain(row) : null;
  }

  async getLatestVersion(examId: string): Promise<number> {
    const [row] = await this.db
      .select({ version: sql<number>`coalesce(max(${examPacks.version}), 0)` })
      .from(examPacks)
      .where(eq(examPacks.examId, examId));
    return Number(row?.version ?? 0);
  }
}
