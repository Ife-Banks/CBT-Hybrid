import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { DrizzleSqliteService } from '../../../shared/database/drizzle-sqlite.service';
import type { SqliteDB } from '../../../shared/database/drizzle-sqlite.service';
import { syncConflicts } from '../../../shared/database/schema';
import type {
  ConflictResolution,
  ConflictStatus,
  SyncConflictRecord,
  SyncEntityType,
} from '../domain/types';
import type { ListConflictsFilter, SyncConflictRepository } from './conflict.repository';

@Injectable()
export class DrizzleSyncConflictRepository implements SyncConflictRepository {
  constructor(@Inject(DrizzleSqliteService) private readonly drizzle: DrizzleSqliteService) {}

  private get db(): SqliteDB {
    return this.drizzle.getDb();
  }

  private static parse(json: string | null): unknown {
    if (json === null) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  private static toRecord(row: typeof syncConflicts.$inferSelect): SyncConflictRecord {
    return {
      id: row.id,
      schoolId: row.schoolId,
      entityType: row.entityType as SyncEntityType,
      entityId: row.entityId,
      localVersion: row.localVersion,
      remoteVersion: row.remoteVersion,
      localUpdatedAt: row.localUpdatedAt,
      remoteUpdatedAt: row.remoteUpdatedAt,
      localValue: DrizzleSyncConflictRepository.parse(row.localJson),
      remoteValue: DrizzleSyncConflictRepository.parse(row.remoteJson),
      status: row.status as ConflictStatus,
      resolution: row.resolution as ConflictResolution | null,
      resolvedValue: DrizzleSyncConflictRepository.parse(row.resolvedJson),
      detectedAt: row.detectedAt,
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
    };
  }

  async insert(record: SyncConflictRecord): Promise<void> {
    await this.db.insert(syncConflicts).values({
      id: record.id,
      schoolId: record.schoolId,
      entityType: record.entityType,
      entityId: record.entityId,
      localVersion: record.localVersion,
      remoteVersion: record.remoteVersion,
      localUpdatedAt: record.localUpdatedAt,
      remoteUpdatedAt: record.remoteUpdatedAt,
      localJson: JSON.stringify(record.localValue ?? null),
      remoteJson: JSON.stringify(record.remoteValue ?? null),
      status: record.status,
      resolution: record.resolution,
      resolvedJson: record.resolvedValue === null ? null : JSON.stringify(record.resolvedValue),
      detectedAt: record.detectedAt,
      resolvedAt: record.resolvedAt,
      resolvedBy: record.resolvedBy,
    });
  }

  async findById(id: string): Promise<SyncConflictRecord | null> {
    const rows = await this.db
      .select()
      .from(syncConflicts)
      .where(eq(syncConflicts.id, id))
      .limit(1);
    return rows[0] ? DrizzleSyncConflictRepository.toRecord(rows[0]) : null;
  }

  async findOpenByEntity(
    schoolId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<SyncConflictRecord | null> {
    const rows = await this.db
      .select()
      .from(syncConflicts)
      .where(
        and(
          eq(syncConflicts.schoolId, schoolId),
          eq(syncConflicts.entityType, entityType),
          eq(syncConflicts.entityId, entityId),
          eq(syncConflicts.status, 'open'),
        ),
      )
      .orderBy(desc(syncConflicts.detectedAt))
      .limit(1);
    return rows[0] ? DrizzleSyncConflictRepository.toRecord(rows[0]) : null;
  }

  async list(filter: ListConflictsFilter = {}): Promise<SyncConflictRecord[]> {
    const conditions = [];
    if (filter.schoolId) conditions.push(eq(syncConflicts.schoolId, filter.schoolId));
    if (filter.status) conditions.push(eq(syncConflicts.status, filter.status));
    if (filter.entityType) conditions.push(eq(syncConflicts.entityType, filter.entityType));
    if (filter.entityId) conditions.push(eq(syncConflicts.entityId, filter.entityId));

    const rows = await this.db
      .select()
      .from(syncConflicts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(syncConflicts.detectedAt))
      .limit(Math.min(Math.max(filter.limit ?? 100, 1), 1000));
    return rows.map(DrizzleSyncConflictRepository.toRecord);
  }

  async countByStatus(schoolId: string, status: ConflictStatus): Promise<number> {
    const rows = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(syncConflicts)
      .where(and(eq(syncConflicts.schoolId, schoolId), eq(syncConflicts.status, status)));
    return Number(rows[0]?.value ?? 0);
  }

  async resolve(
    id: string,
    resolution: ConflictResolution,
    resolvedValue: unknown,
    resolvedBy: string,
    resolvedAt: string,
  ): Promise<void> {
    await this.db
      .update(syncConflicts)
      .set({
        status: 'resolved',
        resolution,
        resolvedJson: JSON.stringify(resolvedValue ?? null),
        resolvedBy,
        resolvedAt,
      })
      .where(eq(syncConflicts.id, id));
  }

  async markIgnored(id: string, resolvedAt: string): Promise<void> {
    await this.db
      .update(syncConflicts)
      .set({ status: 'ignored', resolvedAt })
      .where(eq(syncConflicts.id, id));
  }

  async pruneResolvedBefore(before: string): Promise<void> {
    await this.db
      .delete(syncConflicts)
      .where(
        and(
          inArray(syncConflicts.status, ['resolved', 'ignored']),
          lt(syncConflicts.resolvedAt, before),
        ),
      );
  }
}
