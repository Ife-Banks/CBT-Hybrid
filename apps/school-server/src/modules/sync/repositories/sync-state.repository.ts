export const SYNC_STATE_REPOSITORY = Symbol('SYNC_STATE_REPOSITORY');

/** Sync state and cursors for offline-first school server. */
export interface SyncStateRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
