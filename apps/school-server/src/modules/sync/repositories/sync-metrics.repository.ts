import type { SyncMetricsRecord } from '../domain/types';

/** Injection token for the sync metrics repository. */
export const SYNC_METRICS_REPOSITORY = Symbol('SYNC_METRICS_REPOSITORY');

/** Partial update applied while a sync is in flight. */
export type SyncMetricsPatch = Partial<Omit<SyncMetricsRecord, 'syncId' | 'schoolId' | 'startedAt'>>;

/** Per-sync statistics and analytics (Phase 8, task 8). */
export interface SyncMetricsRepository {
  /** Create the running row at the start of a cycle. */
  start(record: SyncMetricsRecord): Promise<void>;

  /** Merge a partial update into an existing run. */
  update(syncId: string, patch: SyncMetricsPatch): Promise<void>;

  findById(syncId: string): Promise<SyncMetricsRecord | null>;

  /** Newest runs first. */
  listRecent(schoolId: string, limit: number): Promise<SyncMetricsRecord[]>;

  /** All runs started at or after `since` (ISO-8601), oldest first. */
  listSince(schoolId: string, since: string): Promise<SyncMetricsRecord[]>;

  /**
   * Runs still marked `running`. Used on startup to recover from a crash by
   * marking them failed and surfacing the interrupted checkpoints.
   */
  listRunning(schoolId: string): Promise<SyncMetricsRecord[]>;
}
