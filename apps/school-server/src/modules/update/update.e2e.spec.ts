import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { AppModule } from '../../app.module';
import { DrizzleSqliteService } from '../../shared/database/drizzle-sqlite.service';
import * as schema from '../../shared/database/schema';
import { UPDATE_HTTP } from './update.service';
import { UPDATER_RUNNER } from './updater.runner';

const TS = '2026-10-18T00:00:00.000Z';
const PACKAGE_BYTES = new Uint8Array([9, 8, 7, 6, 5]);
const PACKAGE_SHA = createHash('sha256').update(PACKAGE_BYTES).digest('hex');

describe('in-app updates (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataDir: string;
  let http: ReturnType<typeof vi.fn>;
  let updater: { run: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'cbt-update-e2e-'));
    process.env.CBT_DATA_DIR = dataDir;
    process.env.NODE_ENV = 'test';
    process.env.TICKET_SIGNING_SECRET = 'e2e-ticket-secret-0123456789';
    process.env.UPDATE_CHECK_MINUTES = '0';

    http = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/sync/v1/heartbeat')) {
        expect(init?.method).toBe('POST');
        return new Response(
          JSON.stringify({
            server_time: TS,
            update: {
              version: '9.9.9',
              download_url: 'https://releases.test/SchoolCBT-Setup-9.9.9.exe',
              sha256: PACKAGE_SHA,
            },
            flags: { revoke: false },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(PACKAGE_BYTES);
    });
    updater = { run: vi.fn(async () => ({ started: true })) };

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(UPDATE_HTTP)
      .useValue(http)
      .overrideProvider(UPDATER_RUNNER)
      .useValue(updater)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(helmet());
    await app.init();

    // An activated server, as `/setup` would have left it.
    moduleRef
      .get(DrizzleSqliteService)
      .getDb()
      .insert(schema.meta)
      .values({ key: 'cloud_url', value: 'https://cloud.test' })
      .run();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.CBT_DATA_DIR;
    delete process.env.TICKET_SIGNING_SECRET;
    delete process.env.UPDATE_CHECK_MINUTES;
  });

  it('reports an empty update state', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/console/updates').expect(200);

    expect(response.body).toMatchObject({
      offer: null,
      staged: null,
      can_apply: false,
      blocked_reason: 'nothing_staged',
    });
  });

  it('checks the cloud and stages the offered release', async () => {
    const checked = await request(app.getHttpServer())
      .post('/api/v1/console/updates/check')
      .expect(200);
    expect(checked.body.offer).toMatchObject({ version: '9.9.9', sha256: PACKAGE_SHA });

    const staged = await request(app.getHttpServer())
      .post('/api/v1/console/updates/download')
      .expect(200);
    expect(staged.body.staged).toMatchObject({
      version: '9.9.9',
      sha256: PACKAGE_SHA,
      bytes: PACKAGE_BYTES.length,
    });
    expect(staged.body.can_apply).toBe(true);
  });

  it('refuses to apply while a sitting is open', async () => {
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
      .post('/api/v1/console/updates/apply')
      .expect(409);
    expect(response.body.code).toBe('CONFLICT');
    expect(updater.run).not.toHaveBeenCalled();

    const status = await request(app.getHttpServer()).get('/api/v1/console/updates').expect(200);
    expect(status.body).toMatchObject({
      can_apply: false,
      blocked_reason: 'sitting_open',
      blocked_sitting_id: 'sitting-open',
    });
  });

  it('applies the staged release once the sitting is closed', async () => {
    const db = moduleRef.get(DrizzleSqliteService).getDb();
    db.update(schema.sittings)
      .set({ status: 'closed' })
      .where(eq(schema.sittings.id, 'sitting-open'))
      .run();

    const response = await request(app.getHttpServer())
      .post('/api/v1/console/updates/apply')
      .expect(202);
    expect(response.body).toMatchObject({ status: 'applying', version: '9.9.9' });
    expect(updater.run).toHaveBeenCalledTimes(1);
  });
});
