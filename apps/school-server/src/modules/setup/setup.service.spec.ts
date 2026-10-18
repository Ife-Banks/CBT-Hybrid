import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HttpException } from '@nestjs/common';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SchoolConfigService } from '../../common/config/school-config.service';
import { DrizzleMetaRepository } from '../exam/repositories/drizzle-meta.repository';
import { META_KEYS } from '../exam/repositories/meta.repository';
import { createInMemoryDb, type InMemoryDb } from '../sync/testing/in-memory-db';
import { SetupService } from './setup.service';

describe('SetupService', () => {
  let memory: InMemoryDb;
  let meta: DrizzleMetaRepository;
  let service: SetupService;
  let scratch: string;

  async function codeOf(promise: Promise<unknown>): Promise<unknown> {
    const error = (await promise.catch((caught: unknown) => caught)) as HttpException;
    return (error.getResponse() as { code?: unknown }).code;
  }

  beforeEach(async () => {
    memory = await createInMemoryDb();
    meta = new DrizzleMetaRepository(memory.service);
    scratch = mkdtempSync(join(tmpdir(), 'cbt-setup-'));
    const config = {
      port: 8080,
      dataDir: scratch,
      cloudSyncUrl: undefined,
    } as unknown as SchoolConfigService;
    service = new SetupService(meta, config);
  });

  afterEach(() => {
    memory.close();
    rmSync(scratch, { recursive: true, force: true });
  });

  it('reports an unfinished setup before anything is configured', async () => {
    const status = await service.getStatus();

    expect(status).toMatchObject({
      setup_complete: false,
      activated: false,
      console_pin_set: false,
      school: null,
      second_backup_path: null,
      cloud_url: null,
      setup_completed_at: null,
    });
    expect(status.server.url).toMatch(/^http:\/\/.+:8080$/);
    expect(status.server.port).toBe(8080);
  });

  it('sets the console PIN once and hashes it', async () => {
    const status = await service.setConsolePin('123456');

    expect(status.console_pin_set).toBe(true);
    const stored = await meta.get(META_KEYS.consolePinHash);
    expect(stored).toBeTruthy();
    expect(stored).not.toBe('123456');
    expect(stored?.startsWith('$argon2')).toBe(true);
  });

  it('refuses to set the console PIN twice', async () => {
    await service.setConsolePin('123456');
    expect(await codeOf(service.setConsolePin('654321'))).toBe('CONFLICT');
    expect(await service.getStatus().then((s) => s.console_pin_set)).toBe(true);
  });

  it('stores the school name', async () => {
    const status = await service.setSchoolName('Graceland College');
    expect(status.school?.name).toBe('Graceland College');
    expect(await meta.get(META_KEYS.schoolName)).toBe('Graceland College');
  });

  it('accepts a writable backup path', async () => {
    const target = join(scratch, 'backups', 'usb');
    const status = await service.setBackupPath(target);

    expect(status.second_backup_path).toBe(target);
    expect(await meta.get(META_KEYS.secondBackupPath)).toBe(target);
  });

  it('rejects a backup path that cannot be created', async () => {
    const file = join(scratch, 'not-a-folder');
    writeFileSync(file, 'x');

    expect(await codeOf(service.setBackupPath(join(file, 'nested')))).toBe('VALIDATION_FAILED');
    expect(await meta.get(META_KEYS.secondBackupPath)).toBeNull();
  });

  it('marks the setup complete once activation and the PIN are both done', async () => {
    await service.markCompleteIfReady();
    expect(await meta.get(META_KEYS.setupCompletedAt)).toBeNull();

    await meta.set(META_KEYS.deviceId, 'dev-1');
    await service.setConsolePin('123456');

    const status = await service.getStatus();
    expect(status.setup_complete).toBe(true);
    expect(status.setup_completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('builds a lab shortcut from the server address', async () => {
    const shortcut = await service.getLabShortcut();

    expect(shortcut.url).toMatch(/^http:\/\/.+:8080$/);
    expect(shortcut.url_file).toContain(`URL=${shortcut.url}/`);
    expect(shortcut.bat).toContain(`set "SERVER=${shortcut.url}"`);
    expect(shortcut.bat).toContain('%COMPUTERNAME%');
    expect(shortcut.bat_filename).toBe('SchoolCBT-Exam.bat');
  });
});
