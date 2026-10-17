import type { SyncRetryRecord } from '../domain/types';

/** Injection token for the retry-history repository. */
export const SYNC_RETRY_REPOSITORY = Symbol('SYNC_RETRY_REPOSITORY');

/** Retry attempt history for outbox pushes (Phase 8, task 9). */
export interface SyncRetryRepository {
  insert(record: SyncRetryRecord): Promise<void>;

  /** Attempts for one event, oldest first. */
  listByEvent(eventId: string): Promise<SyncRetryRecord[]>;

  /** Newest attempts across all events. */
  listRecent(schoolId: string, limit: number): Promise<SyncRetryRecord[]>;

  countByEvent(eventId: string): Promise<number>;

  /** Delete attempts older than `before` (ISO-8601). */
  pruneBefore(before: string): Promise<void>;
}
