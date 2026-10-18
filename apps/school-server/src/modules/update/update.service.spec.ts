import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SchoolConfigService } from '../../common/config/school-config.service';
import type { BackupService } from '../backup/backup.service';
import * as schema from '../../shared/database/schema';
import { DrizzleCatalogRepository } from '../exam/repositories/drizzle-catalog.repository';
import { DrizzleMetaRepository } from '../exam/repositories/drizzle-meta.repository';
import { createInMemoryDb, type InMemoryDb } from '../sync/testing/in-memory-db';
import { UpdateService, type UpdateOffer } from './update.service';
import type { UpdaterRunner } from './updater.runner';

const TS = '2026-10-18T00:00:00.000Z';
const PACKAGE_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const PACKAGE_SHA = createHash('sha256').update(PACKAGE_BYTES).digest('hex');

const OFFER: UpdateOffer = {
  version: '1.0.4',
  download_url: 'https://releases.test/SchoolCBT-Setup-1.0.4.exe',
  sha256: PACKAGE_SHA,
  min_supported: '1.0.0',
  notes: 'Fixes the seating editor',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('UpdateService', () => {
  let memory: InMemoryDb;
  let meta: DrizzleMetaRepository;
  let catalog: DrizzleCatalogRepository;
  let runner: UpdaterRunner & { run: ReturnType<typeof vi.fn> };
  let backups: { lastBackup: ReturnType<typeof vi.fn> };
  let http: ReturnType<typeof vi.fn>;
  let scratch: string;
  let offer: UpdateOffer | null;
  let heartbeatStatus: number;

  function build(overrides: Record<string, unknown> = {}) {
    const config = {
      port: 8080,
      dataDir: scratch,
      dbPath: join(scratch, 'school.db'),
      updatesDir: join(scratch, 'updates'),
      installDir: join(scratch, 'install'),
      updaterScript: join(scratch, 'install', 'tools', 'apply-update.ps1'),
      cloudSyncUrl: 'https://cloud.test',
      autoUpdate: false,
      updateCheckMinutes: 0,
      isOfflineMode: () => false,
      ...overrides,
    } as unknown as SchoolConfigService;
    return new UpdateService(
      meta,
      catalog,
      runner,
      http as unknown as typeof fetch,
      config,
      backups as unknown as BackupService,
    );
  }

  /** A sitting that references the rows SQLite's foreign keys demand. */
  function seedSitting(id: string, status: string, windowStart: string) {
    const db = memory.db;
    db.insert(schema.classes)
      .values({ id: 'class-1', name: 'JSS 2 Gold', section: 'secondary' })
      .onConflictDoNothing()
      .run();
    db.insert(schema.exams)
      .values({ id: 'exam-1', title: 'Maths', durationMin: 60, settingsJson: '{}', syncedAt: TS })
      .onConflictDoNothing()
      .run();
    db.insert(schema.packs)
      .values({
        id: 'pack-1',
        examId: 'exam-1',
        version: 1,
        keyVersion: 1,
        dirPath: 'packs/pack-1',
        sha256: 'x',
        downloadedAt: TS,
      })
      .onConflictDoNothing()
      .run();
    db.insert(schema.sittings)
      .values({
        id,
        examId: 'exam-1',
        classId: 'class-1',
        packId: 'pack-1',
        windowStart,
        windowEnd: new Date(Date.parse(windowStart) + 3_600_000).toISOString(),
        status,
        syncedAt: TS,
      })
      .run();
  }

  async function codeOf(promise: Promise<unknown>): Promise<unknown> {
    const error = (await promise.catch((caught: unknown) => caught)) as HttpException;
    return (error.getResponse() as { code?: unknown }).code;
  }

  /** Offer the release and download it, leaving nothing else to arrange. */
  async function stage(service = build()): Promise<UpdateService> {
    await service.checkForUpdate();
    await service.downloadUpdate();
    return service;
  }

  beforeEach(async () => {
    memory = await createInMemoryDb();
    meta = new DrizzleMetaRepository(memory.service);
    catalog = new DrizzleCatalogRepository(memory.service);
    runner = { run: vi.fn(async () => ({ started: true })) };
    backups = { lastBackup: vi.fn(async () => null) };
    scratch = mkdtempSync(join(tmpdir(), 'cbt-update-'));
    offer = { ...OFFER };
    heartbeatStatus = 200;

    http = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/sync/v1/heartbeat')) {
        if (heartbeatStatus !== 200) return json({}, heartbeatStatus);
        return json({ server_time: TS, update: offer, flags: { revoke: false } });
      }
      if (init?.method) throw new Error(`unexpected ${init.method} to ${url}`);
      return new Response(PACKAGE_BYTES);
    });
  });

  afterEach(() => {
    memory.close();
    rmSync(scratch, { recursive: true, force: true });
  });

  it('reports an empty update state', async () => {
    const status = await build().getStatus();

    expect(status).toMatchObject({
      auto_update: false,
      offline: false,
      offer: null,
      staged: null,
      checked_at: null,
      check_error: null,
      last_result: null,
      can_apply: false,
      blocked_reason: 'nothing_staged',
      blocked_sitting_id: null,
      command_file: null,
    });
    expect(status.current_version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('records the release the heartbeat offers', async () => {
    const status = await build().checkForUpdate();

    expect(status.offer).toMatchObject({ version: '1.0.4', sha256: PACKAGE_SHA });
    expect(status.check_error).toBeNull();
    expect(status.checked_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const [url, init] = http.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://cloud.test/api/v1/sync/v1/heartbeat');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.software_version).toBe(status.current_version);
    expect(typeof body.db_size_mb).toBe('object'); // null when the file is absent
    expect(body.last_backup_at).toBeNull();
    expect(body.last_backup_ok).toBeNull();
    expect(body.open_sittings).toEqual([]);
  });

  it('reports the last backup in the heartbeat', async () => {
    const at = '2026-10-19T22:00:00.000Z';
    backups.lastBackup.mockResolvedValueOnce({ at, ok: true });

    await build().checkForUpdate();

    const [, init] = http.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.last_backup_at).toBe(at);
    expect(body.last_backup_ok).toBe(true);
  });

  it('forgets a release the heartbeat no longer offers', async () => {
    await build().checkForUpdate();
    offer = null;

    const status = await build().checkForUpdate();
    expect(status.offer).toBeNull();
  });

  it('ignores a malformed offer', async () => {
    offer = { version: '1.0.4' } as UpdateOffer;

    const status = await build().checkForUpdate();
    expect(status.offer).toBeNull();
  });

  it('requires a cloud URL', async () => {
    const service = build({ cloudSyncUrl: undefined });
    expect(await codeOf(service.checkForUpdate())).toBe('CONFLICT');
  });

  it('reports an unreachable cloud without failing', async () => {
    http.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));

    const status = await build().checkForUpdate();
    expect(status.checked_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(status.check_error).toContain('Could not reach the cloud');
  });

  it('records a rejected heartbeat', async () => {
    heartbeatStatus = 503;

    const status = await build().checkForUpdate();
    expect(status.check_error).toContain('HTTP 503');
  });

  it('stages a verified download and writes the updater helper', async () => {
    const status = await (await stage()).getStatus();

    expect(status.staged).toMatchObject({
      version: '1.0.4',
      sha256: PACKAGE_SHA,
      bytes: PACKAGE_BYTES.length,
    });
    expect(status.can_apply).toBe(true);
    expect(status.blocked_reason).toBeNull();

    const path = join(scratch, 'updates', 'SchoolCBT-Setup-1.0.4.exe');
    expect(readFileSync(path)).toEqual(Buffer.from(PACKAGE_BYTES));

    const command = readFileSync(join(scratch, 'updates', 'SchoolCBT-Update.cmd'), 'utf8');
    expect(command).toContain('apply-update.ps1');
    expect(command).toContain(path);
    expect(command).toContain('-Port 8080');
    expect(command).toContain('HealthTimeoutSeconds 60');
  });

  it('rejects a package whose checksum does not match', async () => {
    const service = build();
    await service.checkForUpdate();
    offer = { ...OFFER, sha256: 'deadbeef' };
    await service.checkForUpdate();

    expect(await codeOf(service.downloadUpdate())).toBe('CONFLICT');
    expect((await service.getStatus()).staged).toBeNull();
    expect(existsSync(join(scratch, 'updates', 'SchoolCBT-Setup-1.0.4.exe'))).toBe(false);
  });

  it('requires an offer before downloading', async () => {
    expect(await codeOf(build().downloadUpdate())).toBe('CONFLICT');
  });

  it('refuses to download the version it already runs', async () => {
    const service = build();
    const running = (await service.getStatus()).current_version;
    offer = { ...OFFER, version: running };
    await service.checkForUpdate();

    expect(await codeOf(service.downloadUpdate())).toBe('CONFLICT');
  });

  it('rejects a download URL that is not http', async () => {
    const service = build();
    offer = { ...OFFER, download_url: 'file:///C:/Windows/System32/cmd.exe' };
    await service.checkForUpdate();

    expect(await codeOf(service.downloadUpdate())).toBe('CONFLICT');
  });

  it('refuses to apply before anything is staged', async () => {
    expect(await codeOf(build().applyUpdate())).toBe('CONFLICT');
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('applies the staged update between sittings', async () => {
    const service = await stage();

    const result = await service.applyUpdate();

    expect(result).toMatchObject({ status: 'applying', version: '1.0.4' });
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect((runner.run.mock.calls[0] as [{ commandFile: string }])[0].commandFile).toBe(
      join(scratch, 'updates', 'SchoolCBT-Update.cmd'),
    );
  });

  it('reports a refused elevation instead of pretending to apply', async () => {
    runner.run.mockResolvedValueOnce({ started: false, reason: 'Elevation was refused' });
    const service = await stage();

    const error = (await service.applyUpdate().catch((caught: unknown) => caught)) as HttpException;
    expect((error.getResponse() as { message?: string }).message).toContain(
      'Elevation was refused',
    );
  });

  it('blocks the update while a sitting is open', async () => {
    const service = await stage();
    seedSitting('sitting-open', 'open', new Date(Date.now() - 60_000).toISOString());

    expect(await codeOf(service.applyUpdate())).toBe('CONFLICT');
    expect(runner.run).not.toHaveBeenCalled();

    const status = await service.getStatus();
    expect(status.can_apply).toBe(false);
    expect(status.blocked_reason).toBe('sitting_open');
    expect(status.blocked_sitting_id).toBe('sitting-open');
  });

  it('blocks the update when a sitting starts within two hours', async () => {
    const service = await stage();
    seedSitting('sitting-soon', 'scheduled', new Date(Date.now() + 90 * 60_000).toISOString());

    expect(await codeOf(service.applyUpdate())).toBe('CONFLICT');
    expect((await service.getStatus()).blocked_reason).toBe('sitting_due');
  });

  it('allows the update when the next sitting is more than two hours away', async () => {
    const service = await stage();
    seedSitting('sitting-later', 'scheduled', new Date(Date.now() + 3 * 3_600_000).toISOString());

    const status = await service.getStatus();
    expect(status.can_apply).toBe(true);
    expect(status.blocked_sitting_id).toBeNull();

    await expect(service.applyUpdate()).resolves.toMatchObject({ status: 'applying' });
  });

  it('ignores sittings that are already closed', async () => {
    const service = await stage();
    seedSitting('sitting-done', 'closed', new Date(Date.now() - 3_600_000).toISOString());

    expect((await service.getStatus()).can_apply).toBe(true);
  });

  it('reads back the updater result so the next heartbeat can report it', async () => {
    const service = build();
    mkdirSync(join(scratch, 'updates'), { recursive: true });
    writeFileSync(
      join(scratch, 'updates', 'last-result.json'),
      JSON.stringify({
        status: 'update_failed',
        version: '1.0.4',
        at: TS,
        detail: 'rolled back to the previous version',
      }),
      'utf8',
    );

    const status = await service.getStatus();
    expect(status.last_result).toMatchObject({ status: 'update_failed', version: '1.0.4' });
  });

  it('ignores an unreadable updater result', async () => {
    mkdirSync(join(scratch, 'updates'), { recursive: true });
    writeFileSync(join(scratch, 'updates', 'last-result.json'), 'not json', {
      encoding: 'utf8',
      flag: 'w',
    });

    expect((await build().getStatus()).last_result).toBeNull();
  });

  it('reports offline mode without calling the cloud', async () => {
    const service = build({ isOfflineMode: () => true });

    expect((await service.getStatus()).offline).toBe(true);
    expect(await codeOf(service.checkForUpdate())).toBe('CONFLICT');
    expect(http).not.toHaveBeenCalled();
  });
});
