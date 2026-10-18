import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import helmet from 'helmet';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from './app.module';

/**
 * End-to-end tests for the school-server foundation: health (with SQLite and
 * filesystem checks), the created data layout, correlation ids and
 * problem+json errors.
 */
describe('school-server foundation (e2e)', () => {
  let app: INestApplication;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'cbt-school-'));
    process.env.CBT_DATA_DIR = dataDir;
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(helmet());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.CBT_DATA_DIR;
  });

  it('GET /health reports ok with database and filesystem checks', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('school-server');
    expect(res.body.services.database.status).toBe('ok');
    expect(res.body.services.filesystem.status).toBe('ok');
    expect(res.body.services.memory.status).toBe('ok');
    // A server that has never backed up says so rather than claiming health.
    expect(res.body.services.backup.status).toBe('degraded');
    expect(res.body.services.sync).toBeDefined();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('GET /health/details reports detailed sync diagnostics', async () => {
    const res = await request(app.getHttpServer()).get('/health/details').expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('school-server');
    expect(res.body.databaseIntegrity).toBe('ok');
    expect(res.body.sync).toBeDefined();
    expect(res.body.sync.offlineMode).toBeDefined();
    expect(res.body.sync.cloudSyncUrl).toBeDefined();
    expect(res.body.sync.pendingOutboxEvents).toBeDefined();
    expect(res.body.sync.pendingOutboxByType).toBeDefined();
    expect(res.body.sync.rosterCursor).toBeDefined();
    expect(res.body.sync.packCursor).toBeDefined();
    expect(res.body.sync.lastSyncAt).toBeDefined();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('creates the SQLite database and the four exam-pack folders', () => {
    expect(existsSync(join(dataDir, 'school.db'))).toBe(true);
    for (const folder of ['pending', 'active', 'completed', 'archive']) {
      expect(existsSync(join(dataDir, 'exam-packs', folder))).toBe(true);
    }
  });

  it('returns problem+json for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/nope').expect(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.request_id).toBeTruthy();
  });
});
