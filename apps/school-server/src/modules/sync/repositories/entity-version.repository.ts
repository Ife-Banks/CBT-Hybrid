import type { EntityVersionRecord, SyncEntityType } from '../domain/types';

/** Injection token for the entity version-vector repository. */
export const SYNC_ENTITY_VERSION_REPOSITORY = Symbol('SYNC_ENTITY_VERSION_REPOSITORY');

/**
 * Per-entity version vectors (Phase 8, task 3 and 6). Comparing local, remote
 * and base versions tells the sync engine what changed on each side and
 * therefore whether a pull is a plain update or a conflict.
 */
export interface EntityVersionRepository {
  get(
    schoolId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<EntityVersionRecord | null>;

  /** Insert or replace the version vector for an entity. */
  upsert(record: EntityVersionRecord): Promise<void>;

  list(schoolId: string, entityType?: SyncEntityType, limit?: number): Promise<EntityVersionRecord[]>;

  /** Entities whose local version is ahead of the last-synced base. */
  listLocallyChanged(schoolId: string, entityType?: SyncEntityType): Promise<EntityVersionRecord[]>;
}
