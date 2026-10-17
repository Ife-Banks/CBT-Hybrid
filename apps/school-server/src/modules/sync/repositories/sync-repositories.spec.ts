import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInMemoryDb, type InMemoryDb } from '../testing/in-memory-db';
import { DrizzleEntityVersionRepository } from './drizzle-entity-version.repository';
import { DrizzleSyncConflictRepository } from './drizzle-conflict.repository';
import { DrizzleSyncMetricsRepository } from './drizzle-sync-metrics.repository';
import { DrizzleSyncCheckpointRepository } from './drizzle-sync-checkpoint.repository';
import { DrizzleSyncRetryRepository } from './drizzle-sync-retry.repository';

describe('sync repositories (SQLite)', () => {
  let memo: InMemoryDb;
  let versions: DrizzleEntityVersionRepository;
  let conflicts: DrizzleSyncConflictRepository;
  let metrics: DrizzleSyncMetricsRepository;
  let checkpoints: DrizzleSyncCheckpointRepository;
  let retries: DrizzleSyncRetryRepository;

  beforeEach(async () => {
    memo = await createInMemoryDb();
    versions = new DrizzleEntityVersionRepository(memo.service);
    conflicts = new DrizzleSyncConflictRepository(memo.service);
    metrics = new DrizzleSyncMetricsRepository(memo.service);
    checkpoints = new DrizzleSyncCheckpointRepository(memo.service);
    retries = new DrizzleSyncRetryRepository(memo.service);
  });

  afterEach(() => memo.close());

  describe('entity versions', () => {
    it('round-trips a version vector including the base snapshot', async () => {
      await versions.upsert({
        schoolId: 'school-a',
        entityType: 'student',
        entityId: 's1',
        localVersion: 4,
        remoteVersion: 3,
        baseVersion: 2,
        baseValue: { name: 'Ada' },
        localUpdatedAt: '2026-01-01T00:00:00.000Z',
        remoteUpdatedAt: '2025-12-01T00:00:00.000Z',
        lastSyncedAt: '2026-01-02T00:00:00.000Z',
      });

      const found = await versions.get('school-a', 'student', 's1');
      expect(found).not.toBeNull();
      expect(found!.localVersion).toBe(4);
      expect(found!.baseVersion).toBe(2);
      expect(found!.baseValue).toEqual({ name: 'Ada' });
    });

    it('scopes entities by school', async () => {
      await versions.upsert({
        schoolId: 'school-a',
        entityType: 'student',
        entityId: 's1',
        localVersion: 1,
        remoteVersion: 1,
        baseVersion: 1,
        baseValue: null,
        localUpdatedAt: null,
        remoteUpdatedAt: null,
        lastSyncedAt: null,
      });
      expect(await versions.get('school-b', 'student', 's1')).toBeNull();
    });

    it('lists only entities whose local version moved past the base', async () => {
      const base = {
        schoolId: 'school-a',
        entityType: 'student' as const,
        baseValue: null,
        localUpdatedAt: null,
        remoteUpdatedAt: null,
        lastSyncedAt: null,
        remoteVersion: 1,
      };
      await versions.upsert({ ...base, entityId: 'in-sync', localVersion: 1, baseVersion: 1 });
      await versions.upsert({ ...base, entityId: 'changed', localVersion: 5, baseVersion: 1 });

      const changed = await versions.listLocallyChanged('school-a', 'student');
      expect(changed.map((record) => record.entityId)).toEqual(['changed']);
    });
  });

  describe('conflicts', () => {
    const conflict = {
      id: 'c1',
      schoolId: 'school-a',
      entityType: 'student' as const,
      entityId: 's1',
      localVersion: 3,
      remoteVersion: 4,
      localUpdatedAt: '2026-01-01T00:00:00.000Z',
      remoteUpdatedAt: '2026-01-02T00:00:00.000Z',
      localValue: { name: 'Local' },
      remoteValue: { name: 'Remote' },
      status: 'open' as const,
      resolution: null,
      resolvedValue: null,
      detectedAt: '2026-01-03T00:00:00.000Z',
      resolvedAt: null,
      resolvedBy: null,
    };

    it('finds the open conflict for an entity', async () => {
      await conflicts.insert(conflict);
      const open = await conflicts.findOpenByEntity('school-a', 'student', 's1');
      expect(open?.id).toBe('c1');
      expect(open?.localValue).toEqual({ name: 'Local' });
      expect(await conflicts.countByStatus('school-a', 'open')).toBe(1);
    });

    it('resolves a conflict and records the applied value', async () => {
      await conflicts.insert(conflict);
      await conflicts.resolve('c1', 'remote_wins', { name: 'Remote' }, 'admin', '2026-01-04T00:00:00.000Z');

      const resolved = await conflicts.findById('c1');
      expect(resolved?.status).toBe('resolved');
      expect(resolved?.resolution).toBe('remote_wins');
      expect(resolved?.resolvedValue).toEqual({ name: 'Remote' });
      expect(await conflicts.countByStatus('school-a', 'open')).toBe(0);
    });

    it('filters by status and prunes settled conflicts', async () => {
      await conflicts.insert(conflict);
      await conflicts.markIgnored('c1', '2026-01-01T00:00:00.000Z');
      expect(await conflicts.list({ schoolId: 'school-a', status: 'ignored' })).toHaveLength(1);
      expect(await conflicts.list({ schoolId: 'school-a', status: 'open' })).toHaveLength(0);

      await conflicts.pruneResolvedBefore('2026-06-01T00:00:00.000Z');
      expect(await conflicts.list({ schoolId: 'school-a' })).toHaveLength(0);
    });
  });

  describe('metrics', () => {
    const run = (syncId: string, startedAt: string, status: 'running' | 'success' | 'failed') => ({
      syncId,
      schoolId: 'school-a',
      startedAt,
      completedAt: null,
      durationMs: null,
      pushed: 0,
      pulledRoster: 0,
      pulledPacks: 0,
      errorCount: 0,
      conflictsDetected: 0,
      conflictsResolved: 0,
      bytesTransferred: 0,
      status,
    });

    it('starts, updates and lists recent runs newest first', async () => {
      await metrics.start(run('run-1', '2026-01-01T00:00:00.000Z', 'running'));
      await metrics.start(run('run-2', '2026-01-02T00:00:00.000Z', 'running'));

      await metrics.update('run-1', { pushed: 5, status: 'success', completedAt: '2026-01-01T00:01:00.000Z' });

      const recent = await metrics.listRecent('school-a', 10);
      expect(recent.map((record) => record.syncId)).toEqual(['run-2', 'run-1']);
      const updated = await metrics.findById('run-1');
      expect(updated?.pushed).toBe(5);
      expect(updated?.status).toBe('success');
    });

    it('lists runs since a timestamp and those still running', async () => {
      await metrics.start(run('old', '2025-01-01T00:00:00.000Z', 'success'));
      await metrics.start(run('new', '2026-01-01T00:00:00.000Z', 'running'));

      expect((await metrics.listSince('school-a', '2025-06-01T00:00:00.000Z')).map((r) => r.syncId)).toEqual([
        'new',
      ]);
      expect((await metrics.listRunning('school-a')).map((r) => r.syncId)).toEqual(['new']);
    });
  });

  describe('checkpoints', () => {
    const checkpoint = {
      id: 'run-1:pull_roster',
      syncId: 'run-1',
      schoolId: 'school-a',
      phase: 'pull_roster' as const,
      cursor: null,
      processed: 0,
      total: 0,
      status: 'pending' as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    it('upserts a checkpoint per (sync, phase)', async () => {
      await checkpoints.upsert(checkpoint);
      await checkpoints.upsert({
        ...checkpoint,
        processed: 50,
        total: 100,
        status: 'in_progress',
        cursor: 'cursor-1',
        updatedAt: '2026-01-01T00:05:00.000Z',
      });

      const found = await checkpoints.get('run-1', 'pull_roster');
      expect(found?.processed).toBe(50);
      expect(found?.cursor).toBe('cursor-1');
      expect(await checkpoints.listBySync('run-1')).toHaveLength(1);
    });

    it('lists only non-terminal checkpoints as resumable', async () => {
      await checkpoints.upsert(checkpoint);
      await checkpoints.upsert({
        ...checkpoint,
        id: 'run-1:push',
        phase: 'push',
        status: 'completed',
      });

      const resumable = await checkpoints.listResumable('school-a');
      expect(resumable.map((record) => record.phase)).toEqual(['pull_roster']);
    });

    it('prunes completed checkpoints but keeps in-progress ones', async () => {
      await checkpoints.upsert({ ...checkpoint, status: 'completed' });
      await checkpoints.upsert({ ...checkpoint, id: 'run-1:push', phase: 'push', status: 'in_progress' });
      await checkpoints.pruneCompletedBefore('2026-06-01T00:00:00.000Z');
      expect(await checkpoints.get('run-1', 'pull_roster')).toBeNull();
      expect(await checkpoints.get('run-1', 'push')).not.toBeNull();
    });
  });

  describe('retry history', () => {
    it('records attempts and counts per event', async () => {
      await retries.insert({
        eventId: 'ev-1',
        schoolId: 'school-a',
        attempt: 1,
        errorMsg: 'HTTP 500',
        attemptedAt: '2026-01-01T00:00:00.000Z',
        nextAttemptAt: '2026-01-01T00:00:01.000Z',
      });
      await retries.insert({
        eventId: 'ev-1',
        schoolId: 'school-a',
        attempt: 2,
        errorMsg: 'HTTP 500',
        attemptedAt: '2026-01-01T00:00:02.000Z',
        nextAttemptAt: null,
      });

      const attempts = await retries.listByEvent('ev-1');
      expect(attempts.map((record) => record.attempt)).toEqual([1, 2]);
      expect(await retries.countByEvent('ev-1')).toBe(2);
      expect(await retries.listRecent('school-a', 10)).toHaveLength(2);

      await retries.pruneBefore('2026-06-01T00:00:00.000Z');
      expect(await retries.countByEvent('ev-1')).toBe(0);
    });
  });
});
