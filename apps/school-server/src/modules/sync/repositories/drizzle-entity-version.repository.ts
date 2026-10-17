import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { DrizzleSqliteService } from '../../../shared/database/drizzle-sqlite.service';
import type { SqliteDB } from '../../../shared/database/drizzle-sqlite.service';
import { syncEntityVersions } from '../../../shared/database/schema';
import type { EntityVersionRecord, SyncEntityType } from '../domain/types';
import type { EntityVersionRepository } from './entity-version.repository';

@Injectable()
export class DrizzleEntityVersionRepository implements EntityVersionRepository {
  constructor(@Inject(DrizzleSqliteService) private readonly drizzle: DrizzleSqliteService) {}

  private get db(): SqliteDB {
    return this.drizzle.getDb();
  }

  private static toRecord(row: typeof syncEntityVersions.$inferSelect): EntityVersionRecord {
    let baseValue: unknown = null;
    if (row.baseJson !== null) {
      try {
        baseValue = JSON.parse(row.baseJson);
      } catch {
        baseValue = null;
      }
    }
    return {
      schoolId: row.schoolId,
      entityType: row.entityType as SyncEntityType,
      entityId: row.entityId,
      localVersion: row.localVersion,
      remoteVersion: row.remoteVersion,
      baseVersion: row.baseVersion,
      baseValue,
      localUpdatedAt: row.localUpdatedAt,
      remoteUpdatedAt: row.remoteUpdatedAt,
      lastSyncedAt: row.lastSyncedAt,
    };
  }

  async get(
    schoolId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<EntityVersionRecord | null> {
    const rows = await this.db
      .select()
      .from(syncEntityVersions)
      .where(
        and(
          eq(syncEntityVersions.schoolId, schoolId),
          eq(syncEntityVersions.entityType, entityType),
          eq(syncEntityVersions.entityId, entityId),
        ),
      )
      .limit(1);
    return rows[0] ? DrizzleEntityVersionRepository.toRecord(rows[0]) : null;
  }

  async upsert(record: EntityVersionRecord): Promise<void> {
    await this.db
      .insert(syncEntityVersions)
      .values({
        schoolId: record.schoolId,
        entityType: record.entityType,
        entityId: record.entityId,
        localVersion: record.localVersion,
        remoteVersion: record.remoteVersion,
        baseVersion: record.baseVersion,
        baseJson: record.baseValue === undefined ? null : JSON.stringify(record.baseValue),
        localUpdatedAt: record.localUpdatedAt,
        remoteUpdatedAt: record.remoteUpdatedAt,
        lastSyncedAt: record.lastSyncedAt,
      })
      .onConflictDoUpdate({
        target: [
          syncEntityVersions.schoolId,
          syncEntityVersions.entityType,
          syncEntityVersions.entityId,
        ],
        set: {
          localVersion: record.localVersion,
          remoteVersion: record.remoteVersion,
          baseVersion: record.baseVersion,
          baseJson: record.baseValue === undefined ? null : JSON.stringify(record.baseValue),
          localUpdatedAt: record.localUpdatedAt,
          remoteUpdatedAt: record.remoteUpdatedAt,
          lastSyncedAt: record.lastSyncedAt,
        },
      });
  }

  async list(
    schoolId: string,
    entityType?: SyncEntityType,
    limit = 1000,
  ): Promise<EntityVersionRecord[]> {
    const condition = entityType
      ? and(
          eq(syncEntityVersions.schoolId, schoolId),
          eq(syncEntityVersions.entityType, entityType),
        )
      : eq(syncEntityVersions.schoolId, schoolId);
    const rows = await this.db
      .select()
      .from(syncEntityVersions)
      .where(condition)
      .orderBy(asc(syncEntityVersions.entityId))
      .limit(limit);
    return rows.map(DrizzleEntityVersionRepository.toRecord);
  }

  async listLocallyChanged(
    schoolId: string,
    entityType?: SyncEntityType,
  ): Promise<EntityVersionRecord[]> {
    const scope = entityType
      ? and(
          eq(syncEntityVersions.schoolId, schoolId),
          eq(syncEntityVersions.entityType, entityType),
        )
      : eq(syncEntityVersions.schoolId, schoolId);
    const rows = await this.db
      .select()
      .from(syncEntityVersions)
      .where(and(scope, gt(syncEntityVersions.localVersion, syncEntityVersions.baseVersion)))
      .orderBy(asc(syncEntityVersions.entityId));
    return rows.map(DrizzleEntityVersionRepository.toRecord);
  }

  /** Convenience: total entities tracked for a school. */
  async count(schoolId: string): Promise<number> {
    const rows = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(syncEntityVersions)
      .where(eq(syncEntityVersions.schoolId, schoolId));
    return Number(rows[0]?.value ?? 0);
  }
}
