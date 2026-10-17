import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SyncProgressService } from './sync-progress.service';
import { SyncMetricsService } from './sync-metrics.service';
import { DrizzleSyncCheckpointRepository } from './repositories/drizzle-sync-checkpoint.repository';
import { DrizzleSyncMetricsRepository } from './repositories/drizzle-sync-metrics.repository';
import { createInMemoryDb, type InMemoryDb } from './testing/in-memory-db';

describe('SyncProgressService', () => {
  let memo: InMemoryDb;
  let checkpoints: DrizzleSyncCheckpointRepository;
  let progress: SyncProgressService;

  beforeEach(async () => {
    memo = await createInMemoryDb();
    checkpoints = new DrizzleSyncCheckpointRepository(memo.service);
    progress = new SyncProgressService(checkpoints);
  });

  afterEach(() => memo.close());

  it('tracks percent and ETA and mirrors a checkpoint', async () => {
    progress.begin('run-1', 'school-a', new Date(Date.now() - 2000).toISOString());

    const reported = await progress.report('run-1', {
      phase: 'pull_roster',
      processed: 25,
      total: 100,
      cursor: 'cursor-25',
    });

    expect(reported?.percent).toBe(25);
    expect(reported?.etaMs).not.toBeNull();

    const checkpoint = await checkpoints.get('run-1', 'pull_roster');
    expect(checkpoint?.processed).toBe(25);
    expect(checkpoint?.status).toBe('in_progress');
    expect(checkpoint?.cursor).toBe('cursor-25');
  });

  it('marks a phase complete so it is no longer resumable', async () => {
    progress.begin('run-1', 'school-a');
    await progress.report('run-1', { phase: 'push', processed: 1, total: 1 });
    await progress.completePhase('run-1', 'push', { processed: 1, total: 1 });

    expect(await progress.resumable('school-a')).toHaveLength(0);
  });

  it('exposes resumable checkpoints after an interrupted run', async () => {
    progress.begin('run-1', 'school-a');
    await progress.report('run-1', { phase: 'pull_roster', processed: 10, total: 100 });

    // A fresh service (as after a restart) still sees the durable checkpoint.
    const afterRestart = new SyncProgressService(checkpoints);
    const resumable = await afterRestart.resumable('school-a');
    expect(resumable).toHaveLength(1);
    expect(resumable[0]?.phase).toBe('pull_roster');
    expect(resumable[0]?.processed).toBe(10);
  });

  it('reports the most recently started cycle and its final status', async () => {
    progress.begin('run-1', 'school-a');
    progress.begin('run-2', 'school-a');
    await progress.finish('run-2', 'success');

    expect(progress.current()?.syncId).toBe('run-2');
    expect(progress.current()?.status).toBe('success');
    expect(progress.active()).toHaveLength(1); // run-1 still running
  });
});

describe('SyncMetricsService', () => {
  let memo: InMemoryDb;
  let repo: DrizzleSyncMetricsRepository;
  let service: SyncMetricsService;

  beforeEach(async () => {
    memo = await createInMemoryDb();
    repo = new DrizzleSyncMetricsRepository(memo.service);
    service = new SyncMetricsService(repo);
  });

  afterEach(() => memo.close());

  it('opens, finalises and lists a run', async () => {
    await service.start('run-1', 'school-a', '2026-01-01T00:00:00.000Z');
    const done = await service.finalize(
      'run-1',
      { pushed: 3, pulledRoster: 10, pulledPacks: 2, errorCount: 0, status: 'success' },
      '2026-01-01T00:00:05.000Z',
    );

    expect(done?.durationMs).toBe(5000);
    expect(done?.status).toBe('success');
    expect(await service.recent('school-a', 10)).toHaveLength(1);
  });

  it('computes analytics totals, success rate and daily rollups', async () => {
    await service.start('run-1', 'school-a', '2026-01-01T00:00:00.000Z');
    await service.finalize(
      'run-1',
      { pushed: 1, pulledRoster: 5, errorCount: 0, status: 'success' },
      '2026-01-01T00:00:10.000Z',
    );
    await service.start('run-2', 'school-a', '2026-01-01T06:00:00.000Z');
    await service.finalize(
      'run-2',
      { pushed: 0, pulledRoster: 0, errorCount: 2, conflictsDetected: 1, status: 'partial' },
      '2026-01-01T06:00:20.000Z',
    );
    await service.start('run-3', 'school-a', '2026-01-02T00:00:00.000Z');
    await service.finalize('run-3', { errorCount: 1, status: 'failed' }, '2026-01-02T00:00:01.000Z');

    const analytics = await service.analytics('school-a', {
      days: 3650,
      now: new Date('2026-01-03T00:00:00.000Z'),
    });

    expect(analytics.totalRuns).toBe(3);
    expect(analytics.successRuns).toBe(1);
    expect(analytics.partialRuns).toBe(1);
    expect(analytics.failedRuns).toBe(1);
    expect(analytics.successRate).toBeCloseTo(1 / 3, 4);
    expect(analytics.totalPushed).toBe(1);
    expect(analytics.totalPulledRoster).toBe(5);
    expect(analytics.totalErrors).toBe(3);
    expect(analytics.totalConflictsDetected).toBe(1);
    expect(analytics.daily.map((day) => day.day)).toEqual(['2026-01-01', '2026-01-02']);
    expect(analytics.daily[0]?.runs).toBe(2);
  });

  it('recovers interrupted runs as failed', async () => {
    await service.start('run-1', 'school-a', '2026-01-01T00:00:00.000Z');
    const recovered = await service.recoverInterrupted('school-a', '2026-01-02T00:00:00.000Z');
    expect(recovered).toHaveLength(1);
    expect((await service.get('run-1'))?.status).toBe('failed');
  });
});
