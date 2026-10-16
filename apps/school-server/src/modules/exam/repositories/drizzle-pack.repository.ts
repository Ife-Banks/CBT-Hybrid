import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DrizzleSqliteService } from '../../../shared/database/drizzle-sqlite.service';
import type { SqliteDB } from '../../../shared/database/drizzle-sqlite.service';
import { packs } from '../../../shared/database/schema';
import { toPackRecord } from '../domain/mappers';
import type { PackRecord } from '../domain/types';
import type { PackRepository } from './pack.repository';

@Injectable()
export class DrizzlePackRepository implements PackRepository {
  constructor(@Inject(DrizzleSqliteService) private readonly drizzle: DrizzleSqliteService) {}

  private get db(): SqliteDB {
    return this.drizzle.getDb();
  }

  async findById(id: string): Promise<PackRecord | null> {
    const rows = await this.db.select().from(packs).where(eq(packs.id, id)).limit(1);
    return rows[0] ? toPackRecord(rows[0]) : null;
  }

  async findByExamAndVersion(examId: string, version: number): Promise<PackRecord | null> {
    const rows = await this.db
      .select()
      .from(packs)
      .where(and(eq(packs.examId, examId), eq(packs.version, version)))
      .limit(1);
    return rows[0] ? toPackRecord(rows[0]) : null;
  }

  async create(record: PackRecord): Promise<PackRecord> {
    await this.db.insert(packs).values({
      id: record.id,
      examId: record.examId,
      version: record.version,
      keyVersion: record.keyVersion,
      dirPath: record.dirPath,
      sha256: record.sha256,
      verified: record.verified,
      questionCount: record.questionCount,
      totalMarks: record.totalMarks,
      downloadedAt: record.downloadedAt,
    });
    return record;
  }

  async setVerified(id: string, verified: boolean): Promise<void> {
    await this.db.update(packs).set({ verified }).where(eq(packs.id, id));
  }
}
