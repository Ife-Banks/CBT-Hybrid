import type { CheckpointStatus, SyncCheckpointRecord, SyncPhase } from '../domain/types';

/** Injection token for the resumable checkpoint repository. */
export const SYNC_CHECKPOINT_REPOSITORY = Symbol('SYNC_CHECKPOINT_REPOSITORY');

/** Resumable sync progress and crash recovery (Phase 8, tasks 4 and 5). */
export interface SyncCheckpointRepository {
  /** Insert or update the checkpoint for a (sync, phase) pair. */
  upsert(record: SyncCheckpointRecord): Promise<void>;

  get(syncId: string, phase: SyncPhase): Promise<SyncCheckpointRecord | null>;

  listBySync(syncId: string): Promise<SyncCheckpointRecord[]>;

  /**
   * The most recent checkpoint rows left in a non-terminal state for a school –
   * the resume point after a crash.
   */
  listResumable(schoolId: string): Promise<SyncCheckpointRecord[]>;

  updateStatus(
    syncId: string,
    phase: SyncPhase,
    status: CheckpointStatus,
    updatedAt: string,
  ): Promise<void>;

  /** Delete completed checkpoints older than `before` (ISO-8601). */
  pruneCompletedBefore(before: string): Promise<void>;
}
