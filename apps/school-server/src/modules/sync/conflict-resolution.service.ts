import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CONFLICT_STRATEGIES,
  deepEqual,
  isConflictStrategy,
  isConflicted,
  resolveConflict,
  type ConflictStrategy,
} from './domain/conflict-strategies';
import type {
  ConflictResolution,
  EntityVersionRecord,
  SyncConflictRecord,
  SyncEntityType,
} from './domain/types';
import {
  SYNC_CONFLICT_REPOSITORY,
  type ListConflictsFilter,
  type SyncConflictRepository,
} from './repositories/conflict.repository';
import {
  SYNC_ENTITY_VERSION_REPOSITORY,
  type EntityVersionRepository,
} from './repositories/entity-version.repository';

export { CONFLICT_STRATEGIES, isConflictStrategy, type ConflictStrategy };

export interface DetectInput<T extends Record<string, unknown>> {
  schoolId: string;
  entityType: SyncEntityType;
  entityId: string;
  /** The value both sides last agreed on, if known. */
  base?: Partial<T> | null;
  local: T;
  remote: T;
  localVersion: number;
  remoteVersion: number;
  baseVersion: number;
  localUpdatedAt?: string | null;
  remoteUpdatedAt?: string | null;
  /** Defaults to `merge` (auto-merge clean fields, flag the rest). */
  strategy?: ConflictStrategy;
  now?: string;
}

export interface DetectOutcome<T extends Record<string, unknown>> {
  /** The value to apply locally. */
  value: T;
  /** Whether both sides had diverged. */
  detected: boolean;
  /** Strategy that settled it, or null when left open for a human. */
  resolution: ConflictResolution | null;
  /** True when the conflict is fully settled. */
  resolved: boolean;
  /** Which side/merge produced {@link value}. */
  source: 'local' | 'remote' | 'merged';
  /** Fields auto-merged by the `merge` strategy. */
  autoMergedFields: string[];
  /** Fields changed on both sides; non-empty needs manual attention. */
  conflictFields: string[];
  /** The persisted conflict id when one was opened/updated. */
  conflictId: string | null;
  /** Version vector to persist for the entity. */
  version: Pick<
    EntityVersionRecord,
    'localVersion' | 'remoteVersion' | 'baseVersion' | 'baseValue' | 'localUpdatedAt' | 'remoteUpdatedAt'
  >;
}

/**
 * Conflict detection and resolution (Phase 8, tasks 1, 6 and 7).
 *
 * Given the local record, the remote record and each side's version, this
 * service decides whether they diverged, settles the divergence with a merge
 * strategy, records the outcome for audit and returns the version vector to
 * persist. It never touches the entity table itself – the caller applies
 * {@link DetectOutcome.value}.
 */
@Injectable()
export class ConflictResolutionService {
  private readonly logger = new Logger(ConflictResolutionService.name);

  constructor(
    @Inject(SYNC_CONFLICT_REPOSITORY)
    private readonly conflicts: SyncConflictRepository,
    @Inject(SYNC_ENTITY_VERSION_REPOSITORY)
    private readonly versions: EntityVersionRepository,
  ) {}

  /**
   * Detect and (where a strategy allows) resolve a possible conflict, persist
   * the version vector and record an open conflict when one remains.
   */
  async detectAndResolve<T extends Record<string, unknown>>(
    input: DetectInput<T>,
  ): Promise<DetectOutcome<T>> {
    const {
      schoolId,
      entityType,
      entityId,
      local,
      remote,
      localVersion,
      remoteVersion,
      baseVersion,
    } = input;
    const strategy: ConflictStrategy = input.strategy ?? 'merge';
    const now = input.now ?? new Date().toISOString();

    // ── No divergence: cheap path ───────────────────────────────────────────
    if (!isConflicted(localVersion, remoteVersion, baseVersion)) {
      if (remoteVersion > localVersion) {
        // Remote moved on alone: adopt it and mark both sides agreed.
        const version = {
          localVersion: remoteVersion,
          remoteVersion,
          baseVersion: remoteVersion,
          baseValue: remote,
          localUpdatedAt: input.remoteUpdatedAt ?? now,
          remoteUpdatedAt: input.remoteUpdatedAt ?? now,
        };
        await this.persistVersion(schoolId, entityType, entityId, version, now);
        return {
          value: remote,
          detected: false,
          resolution: null,
          resolved: true,
          source: 'remote',
          autoMergedFields: [],
          conflictFields: [],
          conflictId: null,
          version,
        };
      }

      // Local is level with or ahead of remote: keep it. It stays "locally
      // changed" (local > base) until a push settles it.
      const agreed = Math.min(localVersion, remoteVersion);
      const version = {
        localVersion,
        remoteVersion,
        baseVersion: agreed,
        baseValue: remote,
        localUpdatedAt: input.localUpdatedAt ?? now,
        remoteUpdatedAt: input.remoteUpdatedAt ?? now,
      };
      await this.persistVersion(schoolId, entityType, entityId, version, now);
      return {
        value: local,
        detected: false,
        resolution: null,
        resolved: true,
        source: 'local',
        autoMergedFields: [],
        conflictFields: [],
        conflictId: null,
        version,
      };
    }

    // ── Both sides diverged ────────────────────────────────────────────────
    const outcome = resolveConflict<T>({
      base: input.base,
      local,
      remote,
      localVersion,
      remoteVersion,
      baseVersion,
      localUpdatedAt: input.localUpdatedAt,
      remoteUpdatedAt: input.remoteUpdatedAt,
      strategy,
    });

    const agreedVersion = Math.max(localVersion, remoteVersion);

    if (!outcome.resolved) {
      // Keep our own value and flag the conflict for a human.
      const conflict = await this.openConflict<T>({
        schoolId,
        entityType,
        entityId,
        local,
        remote,
        localVersion,
        remoteVersion,
        localUpdatedAt: input.localUpdatedAt ?? null,
        remoteUpdatedAt: input.remoteUpdatedAt ?? null,
        now,
      });
      const version = {
        localVersion,
        remoteVersion,
        baseVersion,
        baseValue: input.base ?? null,
        localUpdatedAt: input.localUpdatedAt ?? now,
        remoteUpdatedAt: input.remoteUpdatedAt ?? now,
      };
      await this.persistVersion(schoolId, entityType, entityId, version, now);
      this.logger.warn(
        `Conflict left open for ${entityType}:${entityId} (fields: ${outcome.conflictFields.join(', ') || 'n/a'})`,
      );
      return {
        value: local,
        detected: true,
        resolution: null,
        resolved: false,
        source: 'local',
        autoMergedFields: outcome.autoMergedFields,
        conflictFields: outcome.conflictFields,
        conflictId: conflict.id,
        version,
      };
    }

    // Resolved. A remote-winning resolution settles both sides; anything else
    // is a fresh local edit that stays pending until pushed.
    const remoteWon = outcome.resolution === 'remote_wins' || deepEqual(outcome.value, remote);
    const localAfter = remoteWon ? agreedVersion : agreedVersion + 1;
    const version = {
      localVersion: localAfter,
      remoteVersion: agreedVersion,
      baseVersion: agreedVersion,
      baseValue: outcome.value,
      localUpdatedAt: now,
      remoteUpdatedAt: input.remoteUpdatedAt ?? now,
    };
    await this.persistVersion(schoolId, entityType, entityId, version, now);

    return {
      value: outcome.value,
      detected: true,
      resolution: outcome.resolution,
      resolved: true,
      source: outcome.resolution === 'merged' ? 'merged' : remoteWon ? 'remote' : 'local',
      autoMergedFields: outcome.autoMergedFields,
      conflictFields: outcome.conflictFields,
      conflictId: null,
      version,
    };
  }

  /** List recorded conflicts, newest first. */
  async list(filter: ListConflictsFilter = {}): Promise<SyncConflictRecord[]> {
    return this.conflicts.list(filter);
  }

  /** The open conflict for an entity, if any. */
  async findOpen(
    schoolId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<SyncConflictRecord | null> {
    return this.conflicts.findOpenByEntity(schoolId, entityType, entityId);
  }

  /** Number of open conflicts for a school. */
  async openCount(schoolId: string): Promise<number> {
    return this.conflicts.countByStatus(schoolId, 'open');
  }

  /**
   * Resolve an open conflict by id with a chosen strategy, applying the result
   * to the version vector. The caller is responsible for writing the entity
   * value into its own table using the returned `value`.
   */
  async resolveById(
    id: string,
    strategy: ConflictStrategy,
    resolvedBy: string,
    now = new Date().toISOString(),
  ): Promise<{ conflict: SyncConflictRecord; value: unknown; resolution: ConflictResolution } | null> {
    const conflict = await this.conflicts.findById(id);
    if (!conflict || conflict.status !== 'open') return null;

    const local = (conflict.localValue ?? {}) as Record<string, unknown>;
    const remote = (conflict.remoteValue ?? {}) as Record<string, unknown>;
    const outcome = resolveConflict({
      local,
      remote,
      localVersion: conflict.localVersion,
      remoteVersion: conflict.remoteVersion,
      baseVersion: Math.min(conflict.localVersion, conflict.remoteVersion),
      localUpdatedAt: conflict.localUpdatedAt,
      remoteUpdatedAt: conflict.remoteUpdatedAt,
      // `manual` is meaningless here: resolving explicitly picks a value.
      strategy: strategy === 'manual' ? 'local_wins' : strategy,
    });

    const resolution: ConflictResolution = outcome.resolution ?? 'manual';
    await this.conflicts.resolve(id, resolution, outcome.value, resolvedBy, now);

    const agreed = Math.max(conflict.localVersion, conflict.remoteVersion);
    await this.persistVersion(
      conflict.schoolId,
      conflict.entityType,
      conflict.entityId,
      {
        localVersion: resolution === 'remote_wins' ? agreed : agreed + 1,
        remoteVersion: agreed,
        baseVersion: agreed,
        baseValue: outcome.value,
        localUpdatedAt: now,
        remoteUpdatedAt: conflict.remoteUpdatedAt,
      },
      now,
    );

    return {
      conflict: { ...conflict, status: 'resolved', resolution, resolvedAt: now, resolvedBy },
      value: outcome.value,
      resolution,
    };
  }

  /** Dismiss an open conflict without applying either side. */
  async ignore(id: string, now = new Date().toISOString()): Promise<boolean> {
    const conflict = await this.conflicts.findById(id);
    if (!conflict) return false;
    await this.conflicts.markIgnored(id, now);
    return true;
  }

  private async openConflict<T extends Record<string, unknown>>(input: {
    schoolId: string;
    entityType: SyncEntityType;
    entityId: string;
    local: T;
    remote: T;
    localVersion: number;
    remoteVersion: number;
    localUpdatedAt: string | null;
    remoteUpdatedAt: string | null;
    now: string;
  }): Promise<SyncConflictRecord> {
    const existing = await this.conflicts.findOpenByEntity(
      input.schoolId,
      input.entityType,
      input.entityId,
    );
    if (existing) {
      // Refresh the recorded sides so the reviewer sees the latest values.
      await this.conflicts.resolve(existing.id, 'manual', input.local, 'system', input.now);
      await this.conflicts.markIgnored(existing.id, input.now);
    }

    const record: SyncConflictRecord = {
      id: randomUUID(),
      schoolId: input.schoolId,
      entityType: input.entityType,
      entityId: input.entityId,
      localVersion: input.localVersion,
      remoteVersion: input.remoteVersion,
      localUpdatedAt: input.localUpdatedAt,
      remoteUpdatedAt: input.remoteUpdatedAt,
      localValue: input.local,
      remoteValue: input.remote,
      status: 'open',
      resolution: null,
      resolvedValue: null,
      detectedAt: input.now,
      resolvedAt: null,
      resolvedBy: null,
    };
    await this.conflicts.insert(record);
    return record;
  }

  private async persistVersion(
    schoolId: string,
    entityType: SyncEntityType,
    entityId: string,
    version: Pick<
      EntityVersionRecord,
      'localVersion' | 'remoteVersion' | 'baseVersion' | 'baseValue' | 'localUpdatedAt' | 'remoteUpdatedAt'
    >,
    now: string,
  ): Promise<void> {
    await this.versions.upsert({
      schoolId,
      entityType,
      entityId,
      localVersion: version.localVersion,
      remoteVersion: version.remoteVersion,
      baseVersion: version.baseVersion,
      baseValue: version.baseValue,
      localUpdatedAt: version.localUpdatedAt,
      remoteUpdatedAt: version.remoteUpdatedAt,
      lastSyncedAt: now,
    });
  }
}
