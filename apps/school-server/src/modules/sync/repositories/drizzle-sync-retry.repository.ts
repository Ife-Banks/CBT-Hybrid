import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';
import { DrizzleSqliteService } from '../../../shared/database/drizzle-sqlite.service';
import type { SqliteDB } from '../../../shared/database/drizzle-sqlite.service';
import { syncRetryHistory } from '../../../shared/database/schema';
import type { SyncRetryRecord } from '../domain/types';
import type { SyncRetryRepository } from './sync-retry.repository';

@Injectable()
export class DrizzleSyncRetryRepository implements SyncRetryRepository {
  constructor(@Inject(DrizzleSqliteService) private readonly drizzle: DrizzleSqliteService) {}

  private get db(): SqliteDB {
    return this.drizzle.getDb();
  }

  private static toRecord(row: typeof syncRetryHistory.$inferSelect): SyncRetryRecord {
    return {
      eventId: row.eventId,
      schoolId: row.schoolId,
      attempt: row.attempt,
      errorMsg: row.errorMsg,
      attemptedAt: row.attemptedAt,
      nextAttemptAt: row.nextAttemptAt,
    };
  }

  async insert(record: SyncRetryRecord): Promise<void> {
    await this.db.insert(syncRetryHistory).values({
      eventId: record.eventId,
      schoolId: record.schoolId,
      attempt: record.attempt,
      errorMsg: record.errorMsg,
      attemptedAt: record.attemptedAt,
      nextAttemptAt: record.nextAttemptAt,
    });
  }

  async listByEvent(eventId: string): Promise<SyncRetryRecord[]> {
    const rows = await this.db
      .select()
      .from(syncRetryHistory)
      .where(eq(syncRetryHistory.eventId, eventId))
      .orderBy(asc(syncRetryHistory.attempt));
    return rows.map(DrizzleSyncRetryRepository.toRecord);
  }

  async listRecent(schoolId: string, limit: number): Promise<SyncRetryRecord[]> {
    const rows = await this.db
      .select()
      .from(syncRetryHistory)
      .where(eq(syncRetryHistory.schoolId, schoolId))
      .orderBy(desc(syncRetryHistory.attemptedAt))
      .limit(Math.min(Math.max(limit, 1), 1000));
    return rows.map(DrizzleSyncRetryRepository.toRecord);
  }

  async countByEvent(eventId: string): Promise<number> {
    const rows = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(syncRetryHistory)
      .where(eq(syncRetryHistory.eventId, eventId));
    return Number(rows[0]?.value ?? 0);
  }

  async pruneBefore(before: string): Promise<void> {
    await this.db
      .delete(syncRetryHistory)
      .where(and(lt(syncRetryHistory.attemptedAt, before)));
  }
}
