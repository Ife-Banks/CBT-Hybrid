import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { SchoolConfigService } from '../../common/config/school-config.service';
import type { ElevationRunner } from '../../common/process/elevation.runner';
import type { DrizzleSqliteService } from '../../shared/database/drizzle-sqlite.service';
import * as schema from '../../shared/database/schema';
import { DrizzleCatalogRepository } from '../exam/repositories/drizzle-catalog.repository';
import { DrizzleMetaRepository } from '../exam/repositories/drizzle-meta.repository';
import { createInMemoryDb, type InMemoryDb } from '../sync/testing/in-memory-db';
import { DrizzleBackupRepository } from './drizzle-backup.repository';
import { BackupService, type BackupTrigger } from './backup.service';

const TS = '2026-10-18T00:00:00.000Z';
const SQLITE_HEADER = 'SQLite format 3\u0000';

describe('BackupService', () => {
  let memory: InMemoryDb;
  let repository: DrizzleBackupRepository;
  let meta: DrizzleMetaRepository;
  let catalog: DrizzleCatalogRepository;
  let drizzle: DrizzleSqliteService;
  let elevation: ElevationRunner & { run: ReturnType<typeof vi.fn> };
  let scratch: string;
  let dataDir: string;
  let backupsDir: string;

  function build(overrides: Record<string, unknown> = {}) {
    const config = {
      port: 8080,
      dataDir,
      dbPath: join(dataDir, 'school.db'),
      backupsDir,
      preUpdateBackupsDir: join(backupsDir, 'pre-update'),
      preMigrationBackupsDir: join(backupsDir, 'pre-migration'),
      preRestoreBackupsDir: join(backupsDir, 'pre-restore'),
      restoreScript: join(scratch, 'install', 'tools', 'restore-backup.ps1'),
      backupRetention: 30,
      backupHour: 22,
      backupCheckMinutes: 0,
      isOfflineMode: () => false,
      ...overrides,
    } as unknown as SchoolConfigService;
    return new BackupService(repository, meta, catalog, elevation, drizzle, config);
  }

  /** Freeze the service clock so the nightly timer is testable. */
  function withClock(service: BackupService, iso: string): BackupService {
    (service as unknown as { now: () => Date }).now = () => new Date(iso);
    return service;
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

  function localBackups(): string[] {
    return existsSync(backupsDir)
      ? readdirSync(backupsDir).filter((name) => name.startsWith('school-'))
      : [];
  }

  beforeEach(async () => {
    memory = await createInMemoryDb();
    repository = new DrizzleBackupRepository(memory.service);
    meta = new DrizzleMetaRepository(memory.service);
    catalog = new DrizzleCatalogRepository(memory.service);
    elevation = { run: vi.fn(async () => ({ started: true })) };
    scratch = mkdtempSync(join(tmpdir(), 'cbt-backup-'));
    dataDir = join(scratch, 'data');
    backupsDir = join(scratch, 'backups');
    // The service never touches the live file itself; the copy comes from the
    // drizzle service, which backs up whatever connection it holds.
    drizzle = {
      getDb: () => memory.db,
      backupTo: async (destination: string) => {
        mkdirSync(dirname(destination), { recursive: true });
        await memory.sqlite.backup(destination);
      },
    } as unknown as DrizzleSqliteService;
  });

  afterEach(() => {
    memory.close();
    rmSync(scratch, { recursive: true, force: true });
  });

  it('takes a checksummed backup and records it', async () => {
    const entry = await build().createBackup('manual');

    expect(entry.name).toMatch(/^school-\d{8}-\d{6}\.db$/);
    expect(entry).toMatchObject({ location: 'local', ok: true, exists: true });
    expect(entry.path).toBe(join(backupsDir, entry.name));

    const bytes = readFileSync(entry.path);
    expect(bytes.subarray(0, 16).toString('binary')).toBe(SQLITE_HEADER);
    expect(entry.bytes).toBe(bytes.length);
    expect(entry.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));

    const logged = await repository.latest();
    expect(logged).toMatchObject({ path: entry.path, ok: true, sha256: entry.sha256 });
  });

  it('copies the backup to the second location when one is configured', async () => {
    const second = join(scratch, 'usb');
    mkdirSync(second, { recursive: true });
    await meta.set('second_backup_path', second);

    const entry = await build().createBackup('manual');

    expect(existsSync(join(second, entry.name))).toBe(true);
    expect(readFileSync(join(second, entry.name))).toEqual(readFileSync(entry.path));

    const status = await build().getStatus();
    expect(status).toMatchObject({ second_backup_path: second, second_backup_writable: true });
    expect(status.backups.map((backup) => backup.location)).toContain('second');
  });

  it('keeps the backup when the second location cannot be written', async () => {
    const blocked = join(scratch, 'readonly-file', 'usb');
    writeFileSync(join(scratch, 'readonly-file'), 'not a directory', 'utf8');
    await meta.set('second_backup_path', blocked);

    const entry = await build().createBackup('manual');

    expect(existsSync(entry.path)).toBe(true);
    expect(entry.ok).toBe(true);
    expect((await build().getStatus()).second_backup_writable).toBe(false);
  });

  it('prunes to the retention limit, keeping the newest', async () => {
    const service = build({ backupRetention: 2 });
    const first = await service.createBackup('manual');
    const second = await service.createBackup('manual');
    const third = await service.createBackup('manual');

    expect(localBackups().sort()).toEqual([second.name, third.name].sort());
    expect(existsSync(first.path)).toBe(false);
    // The log keeps the history; only the file is removed.
    expect((await repository.list(10)).length).toBe(3);
  });

  it('lists installer and migration copies alongside its own backups', async () => {
    const service = build();
    const owned = await service.createBackup('manual');

    mkdirSync(join(backupsDir, 'pre-update'), { recursive: true });
    mkdirSync(join(backupsDir, 'pre-migration'), { recursive: true });
    writeFileSync(join(backupsDir, 'pre-update-2026-10-18_21-00-00.db'), 'x');
    writeFileSync(join(backupsDir, 'pre-update', 'uninstall-20261018-210000.db'), 'x');
    writeFileSync(join(backupsDir, 'pre-migration', 'pre-migration-20261018-203000.db'), 'x');

    const byName = new Map((await service.listBackups()).map((entry) => [entry.name, entry]));

    expect(byName.get(owned.name)).toMatchObject({ location: 'local', sha256: owned.sha256 });
    expect(byName.get('pre-update-2026-10-18_21-00-00.db')).toMatchObject({
      location: 'pre_update',
      sha256: null,
    });
    expect(byName.get('uninstall-20261018-210000.db')).toMatchObject({ location: 'pre_update' });
    expect(byName.get('pre-migration-20261018-203000.db')).toMatchObject({
      location: 'pre_migration',
    });
  });

  it('reports the newest backup in the log', async () => {
    const service = build();
    expect(await service.lastBackup()).toBeNull();

    const entry = await service.createBackup('manual');

    expect(await service.lastBackup()).toEqual({ at: entry.at, ok: true });
  });

  it('records a failed backup instead of reporting success', async () => {
    drizzle.backupTo = async () => {
      throw new Error('disk full');
    };

    expect(await codeOf(build().createBackup('manual'))).toBe('CONFLICT');

    const logged = await repository.latest();
    expect(logged?.ok).toBe(false);
    expect((await build().getStatus()).last_backup?.ok).toBe(false);
  });

  it('refuses to restore while a sitting is open', async () => {
    const service = build();
    const entry = await service.createBackup('manual');
    seedSitting('sitting-open', 'open', new Date(Date.now() - 60_000).toISOString());

    expect(await codeOf(service.restore(entry.name))).toBe('CONFLICT');
    expect(elevation.run).not.toHaveBeenCalled();
    expect(existsSync(join(backupsDir, 'SchoolCBT-Restore.cmd'))).toBe(false);

    const status = await service.getRestoreStatus();
    expect(status).toMatchObject({
      can_restore: false,
      blocked_reason: 'sitting_open',
      blocked_sitting_id: 'sitting-open',
    });
  });

  it('refuses to restore when a sitting starts within two hours', async () => {
    const service = build();
    const entry = await service.createBackup('manual');
    seedSitting('sitting-soon', 'scheduled', new Date(Date.now() + 90 * 60_000).toISOString());

    expect(await codeOf(service.restore(entry.name))).toBe('CONFLICT');
    expect((await service.getRestoreStatus()).blocked_reason).toBe('sitting_due');
  });

  it('restores between sittings through the elevated helper', async () => {
    const service = build();
    const entry = await service.createBackup('manual');

    const result = await service.restore(entry.name);

    expect(result).toEqual({
      status: 'restoring',
      source: entry.path,
      command_file: join(backupsDir, 'SchoolCBT-Restore.cmd'),
      safety_dir: join(backupsDir, 'pre-restore'),
    });

    const command = readFileSync(result.command_file, 'utf8');
    expect(command).toContain('restore-backup.ps1');
    expect(command).toContain(entry.path);
    expect(command).toContain(`-DataDir "${dataDir}"`);
    expect(command).toContain('-Port 8080');
    expect(command).toContain('HealthTimeoutSeconds 60');
    expect(command).toContain('last-restore.json');

    expect(elevation.run).toHaveBeenCalledTimes(1);
    expect((elevation.run.mock.calls[0] as [{ commandFile: string }])[0].commandFile).toBe(
      result.command_file,
    );
  });

  it('accepts an absolute path that sits in a backup folder', async () => {
    const service = build();
    const entry = await service.createBackup('manual');

    await expect(service.restore(entry.path)).resolves.toMatchObject({ source: entry.path });
  });

  it('reports a refused elevation instead of pretending to restore', async () => {
    elevation.run.mockResolvedValueOnce({ started: false, reason: 'Elevation was refused' });
    const service = build();
    const entry = await service.createBackup('manual');

    const error = (await service.restore(entry.name).catch((caught: unknown) => caught)) as
      HttpException | undefined;
    expect((error?.getResponse() as { message?: string }).message).toContain(
      'Elevation was refused',
    );
  });

  it('rejects a restore source that is not a backup in a backup folder', async () => {
    const service = build();
    await service.createBackup('manual');

    expect(await codeOf(service.restore('nope.db'))).toBe('NOT_FOUND');
    expect(await codeOf(service.restore(''))).toBe('VALIDATION_FAILED');

    const outside = join(scratch, 'outside.db');
    writeFileSync(outside, 'x');
    expect(await codeOf(service.restore(outside))).toBe('VALIDATION_FAILED');

    const notDatabase = join(backupsDir, 'notes.txt');
    writeFileSync(notDatabase, 'x');
    expect(await codeOf(service.restore(notDatabase))).toBe('VALIDATION_FAILED');

    expect(elevation.run).not.toHaveBeenCalled();
  });

  it('offers candidates and the last restore result', async () => {
    const service = build();
    const entry = await service.createBackup('manual');
    writeFileSync(
      join(backupsDir, 'last-restore.json'),
      JSON.stringify({
        status: 'restored',
        source: entry.path,
        at: TS,
        safety_copy: join(backupsDir, 'pre-restore', 'school-20261018-215900.db'),
        detail: 'healthy after restore',
      }),
      'utf8',
    );

    const status = await service.getRestoreStatus();

    expect(status.can_restore).toBe(true);
    expect(status.blocked_reason).toBeNull();
    expect(status.candidates.map((candidate) => candidate.name)).toContain(entry.name);
    expect(status.last_result).toMatchObject({ status: 'restored', source: entry.path });
    expect(status.elevation_command).toContain('SchoolCBT-Restore.cmd');
  });

  it('ignores an unreadable restore result', async () => {
    mkdirSync(backupsDir, { recursive: true });
    writeFileSync(join(backupsDir, 'last-restore.json'), 'not json', 'utf8');

    expect((await build().getRestoreStatus()).last_result).toBeNull();
  });

  it('backs up nightly once past the backup hour', async () => {
    const service = withClock(build({ backupHour: 22 }), '2026-10-18T22:30:00');

    await service.runScheduledBackup();

    expect(localBackups()).toHaveLength(1);
    expect((await repository.latest())?.ok).toBe(true);
  });

  it('does not back up twice on the same day', async () => {
    const service = withClock(build({ backupHour: 22 }), '2026-10-18T22:05:00');
    await service.runScheduledBackup();
    const first = localBackups();

    withClock(service, '2026-10-18T23:00:00');
    await service.runScheduledBackup();

    expect(localBackups()).toEqual(first);
  });

  it('backs up again the next day', async () => {
    const service = withClock(build({ backupHour: 22 }), '2026-10-18T22:05:00');
    await service.runScheduledBackup();

    withClock(service, '2026-10-19T22:05:00');
    await service.runScheduledBackup();

    expect(localBackups()).toHaveLength(2);
  });

  it('skips the nightly backup before the hour', async () => {
    const service = withClock(build({ backupHour: 22 }), '2026-10-18T20:30:00');

    await service.runScheduledBackup();

    expect(localBackups()).toHaveLength(0);
  });

  it('reports the backup configuration', async () => {
    const status = await build({ backupRetention: 7, backupHour: 21 }).getStatus();

    expect(status).toMatchObject({
      local_dir: backupsDir,
      second_backup_path: null,
      second_backup_writable: false,
      retention: 7,
      nightly_hour: 21,
      last_backup: null,
      backups: [],
    });
  });

  it('names backups uniquely when two land in the same second', async () => {
    const service = withClock(build(), '2026-10-18T22:00:00');

    const first = await service.createBackup('sitting' satisfies BackupTrigger);
    const second = await service.createBackup('sitting');

    expect(first.name).not.toBe(second.name);
    expect(localBackups().sort()).toEqual([first.name, second.name].sort());
  });
});
