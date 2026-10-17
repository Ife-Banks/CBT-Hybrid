import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { SchoolConfigService } from '../../common/config/school-config.service';
import type { OutboxEventRecord } from '../exam/domain/types';
import type { OutboxRepository } from '../exam/repositories/outbox.repository';
import { DrizzleMetaRepository } from '../exam/repositories/drizzle-meta.repository';
import type { PackImportService } from '../exam/pack-import.service';
import type { HttpClient, HttpResponse } from './http-client';
import { ConflictResolutionService } from './conflict-resolution.service';
import { DrizzleSyncConflictRepository } from './repositories/drizzle-conflict.repository';
import { DrizzleEntityVersionRepository } from './repositories/drizzle-entity-version.repository';
import { DrizzleSyncCheckpointRepository } from './repositories/drizzle-sync-checkpoint.repository';
import { DrizzleSyncMetricsRepository } from './repositories/drizzle-sync-metrics.repository';
import { DrizzleSyncRetryRepository } from './repositories/drizzle-sync-retry.repository';
import { DrizzleSyncStateRepository } from './repositories/drizzle-sync-state.repository';
import { SyncMetricsService } from './sync-metrics.service';
import { SyncProgressService } from './sync-progress.service';
import { SyncScopeService } from './sync-scope.service';
import { SyncService } from './sync.service';
import { createInMemoryDb, type InMemoryDb } from './testing/in-memory-db';
import { classes, students } from '../../shared/database/schema';

class FakeOutbox implements OutboxRepository {
  private readonly events = new Map<string, OutboxEventRecord & { acked: boolean; next: number }>();

  seed(event: OutboxEventRecord): void {
    this.events.set(event.eventId, { ...event, acked: false, next: 0 });
  }

  async insert(event: OutboxEventRecord): Promise<void> {
    this.seed(event);
  }

  async listPending(): Promise<OutboxEventRecord[]> {
    return [...this.events.values()]
      .filter((event) => !event.acked)
      .map(({ eventId, type, payload, createdAt, attempts }) => ({
        eventId,
        type,
        payload,
        createdAt,
        attempts,
      }));
  }

  async countPending(): Promise<number> {
    return (await this.listPending()).length;
  }

  async acknowledge(eventIds: string[]): Promise<void> {
    for (const id of eventIds) {
      const event = this.events.get(id);
      if (event) event.acked = true;
    }
  }

  async incrementAttempts(eventIds: string[], _nextAttemptAt: string, _errorMsg: string): Promise<void> {
    for (const id of eventIds) {
      const event = this.events.get(id);
      if (event) event.attempts = (event.attempts ?? 0) + 1;
    }
  }
}

class FakeHttp {
  roster: HttpResponse = { ok: true, data: { students: [], cursor: 'cursor-1' } };
  packs: HttpResponse = { ok: true, data: { packs: [], cursor: 'pack-1' } };
  postResult: HttpResponse = { ok: true, data: { status: 'ok' } };
  readonly posts: Array<{ url: string; body: unknown }> = [];

  async get<T>(url: string): Promise<HttpResponse<T>> {
    if (url.includes('/sync/v1/roster')) return this.roster as HttpResponse<T>;
    if (url.includes('/sync/v1/packs')) return this.packs as HttpResponse<T>;
    return { ok: false, error: 'unexpected url' } as HttpResponse<T>;
  }

  async post<T>(url: string, body: unknown): Promise<HttpResponse<T>> {
    this.posts.push({ url, body });
    return this.postResult as HttpResponse<T>;
  }
}

function student(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'st-1',
    code: 'GRC00000001',
    codeStatus: 'active',
    fullName: 'Ada Lovelace',
    classId: 'c1',
    section: 'secondary',
    photoPath: null,
    syncedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('SyncService', () => {
  let memo: InMemoryDb;
  let outbox: FakeOutbox;
  let http: FakeHttp;
  let packImport: { importPack: ReturnType<typeof vi.fn> };
  let config: { isOfflineMode: () => boolean; cloudSyncUrl?: string };
  let service: SyncService;

  let metricsRepo: DrizzleSyncMetricsRepository;
  let retryRepo: DrizzleSyncRetryRepository;
  let conflictRepo: DrizzleSyncConflictRepository;
  let versionRepo: DrizzleEntityVersionRepository;
  let checkpointRepo: DrizzleSyncCheckpointRepository;
  let scope: SyncScopeService;

  async function build(overrides: { offline?: boolean; cloudUrl?: string | undefined } = {}) {
    const metaRepo = new DrizzleMetaRepository(memo.service);
    const stateRepo = new DrizzleSyncStateRepository(memo.service);
    scope = new SyncScopeService(metaRepo, stateRepo);
    metricsRepo = new DrizzleSyncMetricsRepository(memo.service);
    retryRepo = new DrizzleSyncRetryRepository(memo.service);
    conflictRepo = new DrizzleSyncConflictRepository(memo.service);
    versionRepo = new DrizzleEntityVersionRepository(memo.service);
    checkpointRepo = new DrizzleSyncCheckpointRepository(memo.service);

    const progressService = new SyncProgressService(checkpointRepo);
    const metricsService = new SyncMetricsService(metricsRepo);
    const conflictResolution = new ConflictResolutionService(conflictRepo, versionRepo);

    config = {
      isOfflineMode: () => overrides.offline ?? false,
      cloudSyncUrl: 'cloudUrl' in overrides ? overrides.cloudUrl : 'http://cloud.test',
    };

    service = new SyncService(
      outbox,
      packImport as unknown as PackImportService,
      config as unknown as SchoolConfigService,
      http as unknown as HttpClient,
      memo.service,
      scope,
      progressService,
      metricsService,
      conflictResolution,
      retryRepo,
      versionRepo,
    );
  }

  beforeEach(async () => {
    memo = await createInMemoryDb();
    outbox = new FakeOutbox();
    http = new FakeHttp();
    packImport = { importPack: vi.fn().mockResolvedValue({ pack: {}, manifest: {} }) };
    await build();
    // A class the pulled students can reference.
    await memo.db.insert(classes).values({ id: 'c1', name: 'JSS 2', section: 'secondary' });
  });

  afterEach(() => memo.close());

  it('is a no-op in offline mode', async () => {
    await build({ offline: true });
    const result = await service.sync();
    expect(result.errors).toEqual(['Sync is disabled in offline mode']);
    expect(await metricsRepo.listRecent('local', 10)).toHaveLength(0);
  });

  it('pushes outbox events, pulls the roster and records success', async () => {
    outbox.seed({
      eventId: 'ev-1',
      type: 'session.submitted',
      payload: { sessionId: 'sess-1' },
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    http.roster = { ok: true, data: { students: [student()], cursor: 'cursor-9' } };

    const result = await service.sync();

    expect(result.errors).toEqual([]);
    expect(result.pushed).toBe(1);
    expect(result.pulled.roster).toBe(1);
    expect(http.posts).toHaveLength(1);

    const rows = await memo.db.select().from(students);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fullName).toBe('Ada Lovelace');

    const version = await versionRepo.get('local', 'student', 'st-1');
    expect(version?.baseVersion).toBe(1);

    const metrics = await metricsRepo.listRecent('local', 10);
    expect(metrics[0]?.status).toBe('success');
    expect(metrics[0]?.pushed).toBe(1);
    expect(metrics[0]?.pulledRoster).toBe(1);
    expect(metrics[0]?.bytesTransferred).toBeGreaterThan(0);

    expect(await scope.getState('roster_cursor')).toBe('cursor-9');
    expect(service.getProgress()?.status).toBe('success');
  });

  it('keeps the local value and flags a conflict when both sides edited it', async () => {
    await memo.db.insert(students).values({
      id: 'st-1',
      code: 'GRC00000001',
      codeStatus: 'active',
      fullName: 'Ada Local',
      classId: 'c1',
      section: 'secondary',
      photoPath: null,
      syncedAt: '2025-12-01T00:00:00.000Z',
    });
    await versionRepo.upsert({
      schoolId: 'local',
      entityType: 'student',
      entityId: 'st-1',
      localVersion: 2,
      remoteVersion: 1,
      baseVersion: 1,
      baseValue: {
        code: 'GRC00000001',
        codeStatus: 'active',
        fullName: 'Ada Lovelace',
        classId: 'c1',
        section: 'secondary',
        photoPath: null,
      },
      localUpdatedAt: '2026-01-01T00:00:00.000Z',
      remoteUpdatedAt: '2025-12-01T00:00:00.000Z',
      lastSyncedAt: '2025-12-01T00:00:00.000Z',
    });
    // Both sides renamed the student to different values.
    http.roster = {
      ok: true,
      data: { students: [student({ fullName: 'Ada Remote', version: 2 })], cursor: 'cursor-c' },
    };

    const result = await service.sync();

    expect(result.errors).toEqual([]);
    expect(await service.openConflictCount()).toBe(1);

    const [row] = await memo.db.select().from(students).where(eq(students.id, 'st-1'));
    expect(row?.fullName).toBe('Ada Local');

    const conflicts = await service.getConflicts({ status: 'open' });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.localValue).toMatchObject({ fullName: 'Ada Local' });
    expect(conflicts[0]?.remoteValue).toMatchObject({ fullName: 'Ada Remote' });

    const metric = (await metricsRepo.listRecent('local', 1))[0];
    expect(metric?.conflictsDetected).toBe(1);
    expect(metric?.conflictsResolved).toBe(0);
  });

  it('auto-merges non-overlapping edits without a conflict', async () => {
    await memo.db.insert(students).values({
      id: 'st-1',
      code: 'GRC00000001',
      codeStatus: 'active',
      fullName: 'Ada Local',
      classId: 'c1',
      section: 'secondary',
      photoPath: null,
      syncedAt: '2025-12-01T00:00:00.000Z',
    });
    await versionRepo.upsert({
      schoolId: 'local',
      entityType: 'student',
      entityId: 'st-1',
      localVersion: 2,
      remoteVersion: 1,
      baseVersion: 1,
      baseValue: {
        code: 'GRC00000001',
        codeStatus: 'active',
        fullName: 'Ada Lovelace',
        classId: 'c1',
        section: 'secondary',
        photoPath: null,
      },
      localUpdatedAt: '2026-01-01T00:00:00.000Z',
      remoteUpdatedAt: '2025-12-01T00:00:00.000Z',
      lastSyncedAt: '2025-12-01T00:00:00.000Z',
    });
    // Local changed fullName; remote only changed the code status.
    http.roster = {
      ok: true,
      data: {
        students: [student({ fullName: 'Ada Lovelace', codeStatus: 'revoked', version: 2 })],
        cursor: 'cursor-m',
      },
    };

    await service.sync();

    const [row] = await memo.db.select().from(students).where(eq(students.id, 'st-1'));
    expect(row?.fullName).toBe('Ada Local'); // local edit preserved
    expect(row?.codeStatus).toBe('revoked'); // remote edit applied
    expect(await service.openConflictCount()).toBe(0);
  });

  it('records retry history and reports partial failure when a push fails', async () => {
    outbox.seed({
      eventId: 'ev-1',
      type: 'result.scored',
      payload: { score: 10 },
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    http.postResult = { ok: false, error: 'HTTP 500' };
    http.roster = { ok: true, data: { students: [student()], cursor: 'cursor-1' } };

    const result = await service.sync();

    expect(result.errors.some((error) => error.includes('Failed to push'))).toBe(true);
    expect(result.pushed).toBe(0);

    const attempts = await retryRepo.listByEvent('ev-1');
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.errorMsg).toBe('HTTP 500');
    expect(attempts[0]?.attempt).toBe(1);

    const metric = (await metricsRepo.listRecent('local', 1))[0];
    expect(metric?.status).toBe('partial');
    expect(metric?.errorCount).toBeGreaterThan(0);
  });

  it('degrades gracefully without a cloud URL', async () => {
    await build({ cloudUrl: undefined });
    const result = await service.sync();

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.pushed).toBe(0);
    expect((await metricsRepo.listRecent('local', 1))[0]?.status).toBe('failed');
  });

  it('imports packs returned by the cloud in batches', async () => {
    http.packs = {
      ok: true,
      data: {
        packs: [
          { pack_id: 'pack-1', pack_key: Buffer.from('k'.repeat(32)).toString('base64'), pack_bytes: Buffer.from('bytes').toString('base64') },
        ],
        cursor: 'pack-9',
      },
    };

    const result = await service.sync();

    expect(result.pulled.packs).toBe(1);
    expect(packImport.importPack).toHaveBeenCalledTimes(1);
    expect(await scope.getState('pack_cursor')).toBe('pack-9');
  });

  it('reports analytics and status including the school id', async () => {
    await service.sync();
    const status = await service.getStatus();
    expect(status.school_id).toBe('local');
    expect(status.progress).not.toBeNull();

    const analytics = await service.getAnalytics(30);
    expect(analytics.totalRuns).toBe(1);
    expect(analytics.successRuns).toBe(1);
  });
});
