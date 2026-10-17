import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SyncAnalytics, SyncMetricsRecord, SyncRunStatus } from './domain/types';
import {
  SYNC_METRICS_REPOSITORY,
  type SyncMetricsPatch,
  type SyncMetricsRepository,
} from './repositories/sync-metrics.repository';

export interface FinalizeMetrics {
  pushed?: number;
  pulledRoster?: number;
  pulledPacks?: number;
  errorCount?: number;
  conflictsDetected?: number;
  conflictsResolved?: number;
  bytesTransferred?: number;
  status: SyncRunStatus;
}

/**
 * Per-sync statistics and analytics (Phase 8, task 8).
 *
 * A row is opened at the start of every cycle and finalised at the end, so the
 * dashboard can show recent runs, success rates and trends.
 */
@Injectable()
export class SyncMetricsService {
  private readonly logger = new Logger(SyncMetricsService.name);

  constructor(
    @Inject(SYNC_METRICS_REPOSITORY)
    private readonly metrics: SyncMetricsRepository,
  ) {}

  /** Open a running metrics row for a new cycle. */
  async start(syncId: string, schoolId: string, now = new Date().toISOString()): Promise<SyncMetricsRecord> {
    const record: SyncMetricsRecord = {
      syncId,
      schoolId,
      startedAt: now,
      completedAt: null,
      durationMs: null,
      pushed: 0,
      pulledRoster: 0,
      pulledPacks: 0,
      errorCount: 0,
      conflictsDetected: 0,
      conflictsResolved: 0,
      bytesTransferred: 0,
      status: 'running',
    };
    await this.metrics.start(record);
    return record;
  }

  async update(syncId: string, patch: SyncMetricsPatch): Promise<void> {
    await this.metrics.update(syncId, patch);
  }

  /** Finalise a cycle: status, totals and duration. */
  async finalize(
    syncId: string,
    summary: FinalizeMetrics,
    now = new Date().toISOString(),
  ): Promise<SyncMetricsRecord | null> {
    const existing = await this.metrics.findById(syncId);
    if (!existing) return null;

    const startedMs = Date.parse(existing.startedAt);
    const durationMs = Number.isFinite(startedMs) ? Date.parse(now) - startedMs : null;

    await this.metrics.update(syncId, {
      ...summary,
      completedAt: now,
      durationMs: durationMs !== null && durationMs >= 0 ? durationMs : null,
    });
    return this.metrics.findById(syncId);
  }

  async get(syncId: string): Promise<SyncMetricsRecord | null> {
    return this.metrics.findById(syncId);
  }

  async recent(schoolId: string, limit = 20): Promise<SyncMetricsRecord[]> {
    return this.metrics.listRecent(schoolId, limit);
  }

  /**
   * Commit to disk the fact that a cycle started but never finished (the
   * process died). Keeps the dashboard honest after a crash.
   */
  async recoverInterrupted(schoolId: string, now = new Date().toISOString()): Promise<SyncMetricsRecord[]> {
    const running = await this.metrics.listRunning(schoolId);
    for (const run of running) {
      await this.metrics.update(run.syncId, {
        status: 'failed',
        completedAt: now,
        errorCount: run.errorCount + 1,
      });
    }
    if (running.length > 0) {
      this.logger.warn(`Recovered ${running.length} interrupted sync run(s)`);
    }
    return running;
  }

  /** Aggregate analytics over the last `days` days. */
  async analytics(
    schoolId: string,
    options: { days?: number; recentLimit?: number; now?: Date } = {},
  ): Promise<SyncAnalytics> {
    const days = options.days ?? 30;
    const now = options.now ?? new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

    const runs = await this.metrics.listSince(schoolId, since);
    const recentRuns = await this.metrics.listRecent(schoolId, options.recentLimit ?? 10);

    let successRuns = 0;
    let partialRuns = 0;
    let failedRuns = 0;
    let durationSum = 0;
    let durationCount = 0;
    let totalPushed = 0;
    let totalPulledRoster = 0;
    let totalPulledPacks = 0;
    let totalErrors = 0;
    let totalConflictsDetected = 0;
    let totalConflictsResolved = 0;
    const daily = new Map<string, { day: string; runs: number; errors: number; conflicts: number }>();

    for (const run of runs) {
      if (run.status === 'success') successRuns++;
      else if (run.status === 'partial') partialRuns++;
      else if (run.status === 'failed') failedRuns++;

      if (run.durationMs !== null) {
        durationSum += run.durationMs;
        durationCount++;
      }
      totalPushed += run.pushed;
      totalPulledRoster += run.pulledRoster;
      totalPulledPacks += run.pulledPacks;
      totalErrors += run.errorCount;
      totalConflictsDetected += run.conflictsDetected;
      totalConflictsResolved += run.conflictsResolved;

      const day = run.startedAt.slice(0, 10);
      const bucket = daily.get(day) ?? { day, runs: 0, errors: 0, conflicts: 0 };
      bucket.runs++;
      bucket.errors += run.errorCount;
      bucket.conflicts += run.conflictsDetected;
      daily.set(day, bucket);
    }

    const totalRuns = runs.length;
    const completedRuns = successRuns + partialRuns + failedRuns;

    return {
      totalRuns,
      successRuns,
      partialRuns,
      failedRuns,
      successRate: completedRuns === 0 ? 0 : Number((successRuns / completedRuns).toFixed(4)),
      averageDurationMs: durationCount === 0 ? null : Math.round(durationSum / durationCount),
      totalPushed,
      totalPulledRoster,
      totalPulledPacks,
      totalErrors,
      totalConflictsDetected,
      totalConflictsResolved,
      recentRuns,
      daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)),
    };
  }
}
