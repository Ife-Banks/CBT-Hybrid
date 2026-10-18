import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { DrizzleSqliteService } from '../../shared/database/drizzle-sqlite.service';
import * as schema from '../../shared/database/schema';
import { ELEVATION_RUNNER } from '../../common/process/elevation.runner';

const TS = '2026-10-18T00:00:00.000Z';

describe('backups and restores (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let root: string;
  let dataDir: string;
  let backupsDir: string;
  let elevation: { run: ReturnType<typeof vi.fn> };

  function backupFiles(): string[] {
    return existsSync(backupsDir)
      ? readdirSync(backupsDir).filter((name) => name.endsWith('.db'))
      : [];
  }

  beforeAll(async () => {
    // The installer puts `backups` beside `data`, so the test root mirrors it.
    root = mkdtempSync(join(tmpdir(), 'cbt-backup-e2e-'));
    dataDir = join(root, 'data');
    backupsDir = join(root, 'backups');
    mkdirSync(dataDir, { recursive: true });

    process.env.CBT_DATA_DIR = dataDir;
    process.env.NODE_ENV = 'test';
    process.env.TICKET_SIGNING_SECRET = 'e2e-ticket-secret-0123456789';
    process.env.BACKUP_CHECK_MINUTES = '0';

    elevation = { run: vi.fn(async () => ({ started: true })) };

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ELEVATION_RUNNER)
      .useValue(elevation)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(helmet());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
    delete process.env.CBT_DATA_DIR;
    delete process.env.TICKET_SIGNING_SECRET;
    delete process.env.BACKUP_CHECK_MINUTES;
  });

  it('reports no backups yet', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/console/backups').expect(200);

    expect(response.body).toMatchObject({
      local_dir: backupsDir,
      second_backup_path: null,
      last_backup: null,
      backups: [],
    });
  });

  it('takes a backup now and lists it', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/console/backup/now')
      .expect(200);

    expect(created.body).toMatchObject({ location: 'local', ok: true, exists: true });
    expect(created.body.name).toMatch(/^school-\d{8}-\d{6}\.db$/);
    expect(backupFiles()).toContain(created.body.name as string);
    expect(created.body.sha256).toMatch(/^[0-9a-f]{64}$/);

    const listed = await request(app.getHttpServer()).get('/api/v1/console/backups').expect(200);
    expect(listed.body.last_backup).toMatchObject({ ok: true });
    expect((listed.body.backups as Array<{ name: string }>).map((entry) => entry.name)).toContain(
      created.body.name,
    );
  });

  it('backs up after a sitting closes', async () => {
    const db = moduleRef.get(DrizzleSqliteService).getDb();
    db.insert(schema.classes)
      .values({ id: 'class-1', name: 'JSS 2 Gold', section: 'secondary' })
      .run();
    db.insert(schema.exams)
      .values({ id: 'exam-1', title: 'Maths', durationMin: 60, settingsJson: '{}', syncedAt: TS })
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
      .run();
    db.insert(schema.sittings)
      .values({
        id: 'sitting-1',
        examId: 'exam-1',
        classId: 'class-1',
        packId: 'pack-1',
        windowStart: new Date(Date.now() - 60_000).toISOString(),
        windowEnd: new Date(Date.now() + 3_600_000).toISOString(),
        status: 'open',
        syncedAt: TS,
      })
      .run();

    const before = backupFiles().length;

    await request(app.getHttpServer()).post('/api/v1/console/sittings/sitting-1/close').expect(201);

    expect(backupFiles().length).toBe(before + 1);
  });

  it('refuses to restore while a sitting is open', async () => {
    const db = moduleRef.get(DrizzleSqliteService).getDb();
    db.insert(schema.sittings)
      .values({
        id: 'sitting-open',
        examId: 'exam-1',
        classId: 'class-1',
        packId: 'pack-1',
        windowStart: new Date(Date.now() - 60_000).toISOString(),
        windowEnd: new Date(Date.now() + 3_600_000).toISOString(),
        status: 'open',
        syncedAt: TS,
      })
      .run();

    const response = await request(app.getHttpServer())
      .post('/api/v1/console/restore')
      .send({ backup: backupFiles()[0] })
      .expect(409);

    expect(response.body.code).toBe('CONFLICT');
    expect(elevation.run).not.toHaveBeenCalled();

    const status = await request(app.getHttpServer()).get('/api/v1/console/restore').expect(200);
    expect(status.body).toMatchObject({
      can_restore: false,
      blocked_reason: 'sitting_open',
      blocked_sitting_id: 'sitting-open',
    });
  });

  it('restores a backup between sittings', async () => {
    const db = moduleRef.get(DrizzleSqliteService).getDb();
    db.delete(schema.sittings).run();

    const [chosen] = backupFiles().sort();
    if (!chosen) throw new Error('No backup to restore');
    const response = await request(app.getHttpServer())
      .post('/api/v1/console/restore')
      .send({ backup: chosen })
      .expect(202);

    expect(response.body).toMatchObject({ status: 'restoring' });
    expect(response.body.source).toBe(join(backupsDir, chosen));
    expect(elevation.run).toHaveBeenCalledTimes(1);
    expect(existsSync(join(backupsDir, 'SchoolCBT-Restore.cmd'))).toBe(true);

    writeFileSync(
      join(backupsDir, 'last-restore.json'),
      JSON.stringify({
        status: 'restored',
        source: response.body.source,
        at: TS,
        safety_copy: join(backupsDir, 'pre-restore', 'school-20261018-220000.db'),
        detail: 'healthy after restore',
      }),
      'utf8',
    );

    const status = await request(app.getHttpServer()).get('/api/v1/console/restore').expect(200);
    expect(status.body.can_restore).toBe(true);
    expect(status.body.last_result).toMatchObject({ status: 'restored' });
  });

  it('rejects a restore source that is not a backup', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/console/restore')
      .send({ backup: 'missing.db' })
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');
  });
});
