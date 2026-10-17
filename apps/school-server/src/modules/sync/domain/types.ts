/**
 * Domain records for the Phase 8 sync system (CBT-Phase-8-SyncSystem).
 *
 * The school server is offline-first: the exam-delivery path never blocks on the
 * cloud. These types describe the bookkeeping that surrounds it – versions,
 * conflicts, metrics, checkpoints, retry history and progress – so that a long
 * sync can be observed, resumed and reasoned about.
 */

/** Kinds of things that sync between the cloud and a school server. */
export type SyncEntityType =
  | 'student'
  | 'roster'
  | 'pack'
  | 'exam'
  | 'sitting'
  | 'event'
  | 'result';

/** Lifecycle of a detected conflict. */
export type ConflictStatus = 'open' | 'resolved' | 'ignored';

/** How a conflict was settled. */
export type ConflictResolution = 'local_wins' | 'remote_wins' | 'merged' | 'manual';

/** Outcome of a finished sync cycle. */
export type SyncRunStatus = 'running' | 'success' | 'partial' | 'failed';

/** Phase a sync cycle is currently in. */
export type SyncPhase = 'push' | 'pull_roster' | 'pull_packs' | 'complete';

/** Lifecycle of a resumable checkpoint. */
export type CheckpointStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * One row per detected conflict: the same entity changed on both the cloud and
 * the school server since their last common sync. Both sides are retained for
 * audit; `resolvedJson` holds the value that was actually applied.
 */
export interface SyncConflictRecord {
  id: string;
  schoolId: string;
  entityType: SyncEntityType;
  entityId: string;
  localVersion: number;
  remoteVersion: number;
  localUpdatedAt: string | null;
  remoteUpdatedAt: string | null;
  localValue: unknown;
  remoteValue: unknown;
  status: ConflictStatus;
  resolution: ConflictResolution | null;
  resolvedValue: unknown | null;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

/** Per-sync aggregated statistics (one row per cycle). */
export interface SyncMetricsRecord {
  syncId: string;
  schoolId: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  pushed: number;
  pulledRoster: number;
  pulledPacks: number;
  errorCount: number;
  conflictsDetected: number;
  conflictsResolved: number;
  bytesTransferred: number;
  status: SyncRunStatus;
}

/** Where a long sync got to, so it can resume instead of restarting. */
export interface SyncCheckpointRecord {
  id: string;
  syncId: string;
  schoolId: string;
  phase: SyncPhase;
  cursor: string | null;
  processed: number;
  total: number;
  status: CheckpointStatus;
  updatedAt: string;
}

/** Audit row for a single outbox retry attempt. */
export interface SyncRetryRecord {
  eventId: string;
  schoolId: string;
  attempt: number;
  errorMsg: string;
  attemptedAt: string;
  nextAttemptAt: string | null;
}

/**
 * Version vector for one entity. `local` describes this school server, `remote`
 * describes the last state seen from the cloud, and `base` is the version they
 * last agreed on. A conflict exists when both local and remote have moved past
 * base.
 */
export interface EntityVersionRecord {
  entityType: SyncEntityType;
  entityId: string;
  schoolId: string;
  localVersion: number;
  remoteVersion: number;
  baseVersion: number;
  /** JSON snapshot both sides last agreed on, for three-way merges. */
  baseValue: unknown;
  localUpdatedAt: string | null;
  remoteUpdatedAt: string | null;
  lastSyncedAt: string | null;
}

/** Live progress of an in-flight (or most recent) sync cycle. */
export interface SyncProgress {
  syncId: string;
  schoolId: string;
  phase: SyncPhase;
  processed: number;
  total: number;
  /** 0-100, rounded. `null` until a total is known. */
  percent: number | null;
  /** Estimated milliseconds remaining, from the observed processing rate. */
  etaMs: number | null;
  status: SyncRunStatus;
  startedAt: string;
  updatedAt: string;
}

/** Result of a three-way field merge. */
export interface MergeResult<T = Record<string, unknown>> {
  /** The merged record with non-conflicting changes applied. */
  merged: T;
  /** Field names changed on exactly one side and applied automatically. */
  autoMerged: string[];
  /** Field names changed on both sides to different values. */
  conflicts: string[];
}

/** Aggregate analytics computed from recorded sync metrics. */
export interface SyncAnalytics {
  totalRuns: number;
  successRuns: number;
  partialRuns: number;
  failedRuns: number;
  successRate: number;
  averageDurationMs: number | null;
  totalPushed: number;
  totalPulledRoster: number;
  totalPulledPacks: number;
  totalErrors: number;
  totalConflictsDetected: number;
  totalConflictsResolved: number;
  /** Most recent runs, newest first. */
  recentRuns: SyncMetricsRecord[];
  /** Per-day rollups, oldest first. */
  daily: Array<{ day: string; runs: number; errors: number; conflicts: number }>;
}
