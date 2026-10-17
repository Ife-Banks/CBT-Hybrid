import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, lt, notInArray } from 'drizzle-orm';
import { DrizzleSqliteService } from '../../../shared/database/drizzle-sqlite.service';
import type { SqliteDB } from '../../../shared/database/drizzle-sqlite.service';
import { syncCheckpoints } from '../../../shared/database/schema';
import type { CheckpointStatus, SyncCheckpointRecord, SyncPhase } from '../domain/types';
import type { SyncCheckpointRepository } from './sync-checkpoint.repository';

@Injectable()
export class DrizzleSyncCheckpointRepository implements SyncCheckpointRepository {
  constructor(@Inject(DrizzleSqliteService) private readonly drizzle: DrizzleSqliteService) {}

  private get db(): SqliteDB {
    return this.drizzle.getDb();
  }

  private static toRecord(row: typeof syncCheckpoints.$inferSelect): SyncCheckpointRecord {
    return {
      id: row.id,
      syncId: row.syncId,
      schoolId: row.schoolId,
      phase: row.phase as SyncPhase,
      cursor: row.cursor,
      processed: row.processed,
      total: row.total,
      status: row.status as CheckpointStatus,
      updatedAt: row.updatedAt,
    };
  }

  async upsert(record: SyncCheckpointRecord): Promise<void> {
    await this.db
      .insert(syncCheckpoints)
      .values({
        id: record.id,
        syncId: record.syncId,
        schoolId: record.schoolId,
        phase: record.phase,
        cursor: record.cursor,
        processed: record.processed,
        total: record.total,
        status: record.status,
        updatedAt: record.updatedAt,
      })
      .onConflictDoUpdate({
        target: [syncCheckpoints.syncId, syncCheckpoints.phase],
        set: {
          cursor: record.cursor,
          processed: record.processed,
          total: record.total,
          status: record.status,
          updatedAt: record.updatedAt,
        },
      });
  }

  async get(syncId: string, phase: SyncPhase): Promise<SyncCheckpointRecord | null> {
    const rows = await this.db
      .select()
      .from(syncCheckpoints)
      .where(and(eq(syncCheckpoints.syncId, syncId), eq(syncCheckpoints.phase, phase)))
      .limit(1);
    return rows[0] ? DrizzleSyncCheckpointRepository.toRecord(rows[0]) : null;
  }

  async listBySync(syncId: string): Promise<SyncCheckpointRecord[]> {
    const rows = await this.db
      .select()
      .from(syncCheckpoints)
      .where(eq(syncCheckpoints.syncId, syncId))
      .orderBy(asc(syncCheckpoints.updatedAt));
    return rows.map(DrizzleSyncCheckpointRepository.toRecord);
  }

  async listResumable(schoolId: string): Promise<SyncCheckpointRecord[]> {
    const rows = await this.db
      .select()
      .from(syncCheckpoints)
      .where(
        and(
          eq(syncCheckpoints.schoolId, schoolId),
          inArray(syncCheckpoints.status, ['pending', 'in_progress', 'failed']),
        ),
      )
      .orderBy(desc(syncCheckpoints.updatedAt))
      .limit(50);
    return rows.map(DrizzleSyncCheckpointRepository.toRecord);
  }

  async updateStatus(
    syncId: string,
    phase: SyncPhase,
    status: CheckpointStatus,
    updatedAt: string,
  ): Promise<void> {
    await this.db
      .update(syncCheckpoints)
      .set({ status, updatedAt })
      .where(and(eq(syncCheckpoints.syncId, syncId), eq(syncCheckpoints.phase, phase)));
  }

  async pruneCompletedBefore(before: string): Promise<void> {
    await this.db
      .delete(syncCheckpoints)
      .where(
        and(
          notInArray(syncCheckpoints.status, ['pending', 'in_progress']),
          lt(syncCheckpoints.updatedAt, before),
        ),
      );
  }
}
