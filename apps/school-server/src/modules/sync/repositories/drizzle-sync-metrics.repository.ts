import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { DrizzleSqliteService } from '../../../shared/database/drizzle-sqlite.service';
import type { SqliteDB } from '../../../shared/database/drizzle-sqlite.service';
import { syncMetrics } from '../../../shared/database/schema';
import type { SyncMetricsRecord, SyncRunStatus } from '../domain/types';
import type { SyncMetricsPatch, SyncMetricsRepository } from './sync-metrics.repository';

@Injectable()
export class DrizzleSyncMetricsRepository implements SyncMetricsRepository {
  constructor(@Inject(DrizzleSqliteService) private readonly drizzle: DrizzleSqliteService) {}

  private get db(): SqliteDB {
    return this.drizzle.getDb();
  }

  private static toRecord(row: typeof syncMetrics.$inferSelect): SyncMetricsRecord {
    return {
      syncId: row.syncId,
      schoolId: row.schoolId,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      durationMs: row.durationMs,
      pushed: row.pushed,
      pulledRoster: row.pulledRoster,
      pulledPacks: row.pulledPacks,
      errorCount: row.errorCount,
      conflictsDetected: row.conflictsDetected,
      conflictsResolved: row.conflictsResolved,
      bytesTransferred: row.bytesTransferred,
      status: row.status as SyncRunStatus,
    };
  }

  async start(record: SyncMetricsRecord): Promise<void> {
    await this.db.insert(syncMetrics).values({
      syncId: record.syncId,
      schoolId: record.schoolId,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      durationMs: record.durationMs,
      pushed: record.pushed,
      pulledRoster: record.pulledRoster,
      pulledPacks: record.pulledPacks,
      errorCount: record.errorCount,
      conflictsDetected: record.conflictsDetected,
      conflictsResolved: record.conflictsResolved,
      bytesTransferred: record.bytesTransferred,
      status: record.status,
    });
  }

  async update(syncId: string, patch: SyncMetricsPatch): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    await this.db.update(syncMetrics).set(patch).where(eq(syncMetrics.syncId, syncId));
  }

  async findById(syncId: string): Promise<SyncMetricsRecord | null> {
    const rows = await this.db
      .select()
      .from(syncMetrics)
      .where(eq(syncMetrics.syncId, syncId))
      .limit(1);
    return rows[0] ? DrizzleSyncMetricsRepository.toRecord(rows[0]) : null;
  }

  async listRecent(schoolId: string, limit: number): Promise<SyncMetricsRecord[]> {
    const rows = await this.db
      .select()
      .from(syncMetrics)
      .where(eq(syncMetrics.schoolId, schoolId))
      .orderBy(desc(syncMetrics.startedAt))
      .limit(Math.min(Math.max(limit, 1), 1000));
    return rows.map(DrizzleSyncMetricsRepository.toRecord);
  }

  async listSince(schoolId: string, since: string): Promise<SyncMetricsRecord[]> {
    const rows = await this.db
      .select()
      .from(syncMetrics)
      .where(and(eq(syncMetrics.schoolId, schoolId), gte(syncMetrics.startedAt, since)))
      .orderBy(asc(syncMetrics.startedAt));
    return rows.map(DrizzleSyncMetricsRepository.toRecord);
  }

  async listRunning(schoolId: string): Promise<SyncMetricsRecord[]> {
    const rows = await this.db
      .select()
      .from(syncMetrics)
      .where(and(eq(syncMetrics.schoolId, schoolId), eq(syncMetrics.status, 'running')))
      .orderBy(asc(syncMetrics.startedAt));
    return rows.map(DrizzleSyncMetricsRepository.toRecord);
  }
}
