import type {
  ConflictResolution,
  ConflictStatus,
  SyncConflictRecord,
  SyncEntityType,
} from '../domain/types';

/** Injection token for the sync conflict repository. */
export const SYNC_CONFLICT_REPOSITORY = Symbol('SYNC_CONFLICT_REPOSITORY');

export interface ListConflictsFilter {
  schoolId?: string;
  status?: ConflictStatus;
  entityType?: SyncEntityType;
  entityId?: string;
  limit?: number;
}

/** Persists conflicts detected during sync and their resolutions (tasks 1, 6, 7). */
export interface SyncConflictRepository {
  insert(record: SyncConflictRecord): Promise<void>;

  findById(id: string): Promise<SyncConflictRecord | null>;

  /** The open conflict for an entity, if one exists (avoids duplicates). */
  findOpenByEntity(
    schoolId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<SyncConflictRecord | null>;

  list(filter?: ListConflictsFilter): Promise<SyncConflictRecord[]>;

  countByStatus(schoolId: string, status: ConflictStatus): Promise<number>;

  resolve(
    id: string,
    resolution: ConflictResolution,
    resolvedValue: unknown,
    resolvedBy: string,
    resolvedAt: string,
  ): Promise<void>;

  markIgnored(id: string, resolvedAt: string): Promise<void>;

  /** Delete resolved/ignored conflicts older than `before` (ISO-8601). */
  pruneResolvedBefore(before: string): Promise<void>;
}
