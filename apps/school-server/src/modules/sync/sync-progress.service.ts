import { Inject, Injectable, Logger } from '@nestjs/common';
import { estimateEtaMs } from './domain/batch';
import type { SyncProgress, SyncRunStatus, SyncPhase } from './domain/types';
import {
  SYNC_CHECKPOINT_REPOSITORY,
  type SyncCheckpointRepository,
} from './repositories/sync-checkpoint.repository';

export interface ProgressUpdate {
  phase?: SyncPhase;
  processed?: number;
  total?: number;
  status?: SyncRunStatus;
  cursor?: string | null;
}

function checkpointId(syncId: string, phase: SyncPhase): string {
  return `${syncId}:${phase}`;
}

/**
 * Real-time sync progress with durable checkpoints (Phase 8, tasks 4 and 5).
 *
 * Progress is kept in memory for cheap, synchronous reads by the status
 * endpoint, and mirrored into `sync_checkpoints` after every batch so an
 * interrupted sync can be resumed (and so a restart can report what was in
 * flight when the process died).
 */
@Injectable()
export class SyncProgressService {
  private readonly logger = new Logger(SyncProgressService.name);
  private readonly inFlight = new Map<string, SyncProgress>();
  private lastSyncId: string | null = null;

  constructor(
    @Inject(SYNC_CHECKPOINT_REPOSITORY)
    private readonly checkpoints: SyncCheckpointRepository,
  ) {}

  /** Begin tracking a cycle. */
  begin(syncId: string, schoolId: string, now = new Date().toISOString()): SyncProgress {
    const progress: SyncProgress = {
      syncId,
      schoolId,
      phase: 'push',
      processed: 0,
      total: 0,
      percent: 0,
      etaMs: null,
      status: 'running',
      startedAt: now,
      updatedAt: now,
    };
    this.inFlight.set(syncId, progress);
    this.lastSyncId = syncId;
    return progress;
  }

  /**
   * Report progress and persist a checkpoint. Called between batches so the
   * checkpoint rate stays proportional to work, not records.
   */
  async report(
    syncId: string,
    update: ProgressUpdate,
    now = new Date().toISOString(),
  ): Promise<SyncProgress | null> {
    const current = this.inFlight.get(syncId);
    if (!current) return null;

    const phase = update.phase ?? current.phase;
    const processed = update.processed ?? current.processed;
    const total = update.total ?? current.total;
    const startedMs = Date.parse(current.startedAt);
    const elapsed = Number.isFinite(startedMs) ? Date.now() - startedMs : 0;

    const next: SyncProgress = {
      ...current,
      phase,
      processed,
      total,
      percent: total > 0 ? Math.round((processed / total) * 100) : current.percent,
      etaMs: estimateEtaMs(processed, total, elapsed),
      status: update.status ?? current.status,
      updatedAt: now,
    };
    this.inFlight.set(syncId, next);

    await this.checkpoints.upsert({
      id: checkpointId(syncId, phase),
      syncId,
      schoolId: next.schoolId,
      phase,
      cursor: update.cursor ?? null,
      processed,
      total,
      status: next.status === 'failed' ? 'failed' : 'in_progress',
      updatedAt: now,
    });

    return next;
  }

  /** Mark a phase complete so its checkpoint is no longer resumable. */
  async completePhase(
    syncId: string,
    phase: SyncPhase,
    update: ProgressUpdate = {},
    now = new Date().toISOString(),
  ): Promise<void> {
    const current = this.inFlight.get(syncId);
    if (current && (update.processed !== undefined || update.total !== undefined)) {
      this.inFlight.set(syncId, {
        ...current,
        phase,
        processed: update.processed ?? current.processed,
        total: update.total ?? current.total,
        updatedAt: now,
      });
    }
    await this.checkpoints.upsert({
      id: checkpointId(syncId, phase),
      syncId,
      schoolId: current?.schoolId ?? 'local',
      phase,
      cursor: update.cursor ?? null,
      processed: update.processed ?? current?.processed ?? 0,
      total: update.total ?? current?.total ?? 0,
      status: 'completed',
      updatedAt: now,
    });
  }

  /** Complete a cycle; keeps the in-memory record for the status endpoint. */
  async finish(syncId: string, status: SyncRunStatus): Promise<SyncProgress | null> {
    const current = this.inFlight.get(syncId);
    if (!current) return null;
    const finished: SyncProgress = {
      ...current,
      status,
      percent: status === 'success' ? 100 : current.percent,
      etaMs: status === 'running' ? current.etaMs : 0,
      phase: 'complete',
      updatedAt: new Date().toISOString(),
    };
    this.inFlight.set(syncId, finished);
    return finished;
  }

  /** Drop a cycle from the in-memory map (after it is fully reported). */
  forget(syncId: string): void {
    this.inFlight.delete(syncId);
  }

  /** Progress for a specific cycle. */
  get(syncId: string): SyncProgress | null {
    return this.inFlight.get(syncId) ?? null;
  }

  /** Progress for the most recently started cycle, running or finished. */
  current(): SyncProgress | null {
    if (this.lastSyncId) {
      const found = this.inFlight.get(this.lastSyncId);
      if (found) return found;
    }
    // Fall back to the most recently updated entry.
    let latest: SyncProgress | null = null;
    for (const progress of this.inFlight.values()) {
      if (!latest || progress.updatedAt > latest.updatedAt) latest = progress;
    }
    return latest;
  }

  /** Cycles still marked running. */
  active(): SyncProgress[] {
    return [...this.inFlight.values()].filter((progress) => progress.status === 'running');
  }

  /** Checkpoints left non-terminal for a school: the crash-recovery resume set. */
  async resumable(schoolId: string) {
    return this.checkpoints.listResumable(schoolId);
  }

  /** Checkpoints recorded for a specific cycle. */
  async checkpointsFor(syncId: string) {
    return this.checkpoints.listBySync(syncId);
  }

  /** Prune completed checkpoints older than `before` (ISO-8601). */
  async prune(before: string): Promise<void> {
    await this.checkpoints.pruneCompletedBefore(before);
    this.logger.debug(`Pruned completed sync checkpoints before ${before}`);
  }
}
