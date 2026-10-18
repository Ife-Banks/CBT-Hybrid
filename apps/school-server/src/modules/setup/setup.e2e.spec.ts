import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { ACTIVATION_HTTP } from './activation.service';
import { DEVICE_SECRET_STORE, InMemoryDeviceSecretStore } from './device-secret.store';
import { MACHINE_ID_HASH } from './machine-identity';

const ISSUED = {
  device_id: 'dev-1',
  key_id: 'k-1',
  secret: 's3cret',
  school: { id: 'school-1', code: 'GRC', name: 'Graceland College' },
  cloud_signing_key: { key_id: 'cloud-1', public_key: 'PUBKEY' },
  initial_cursor: 0,
  sync_interval_seconds: 900,
  restore_available: false,
};

describe('first-run setup (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataDir: string;
  let backupDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'cbt-setup-e2e-'));
    backupDir = join(dataDir, 'second-backup');
    process.env.CBT_DATA_DIR = dataDir;
    process.env.NODE_ENV = 'test';
    process.env.TICKET_SIGNING_SECRET = 'e2e-ticket-secret-0123456789';
    delete process.env.cloudSyncUrl;

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ACTIVATION_HTTP)
      .useValue(
        async () =>
          new Response(JSON.stringify(ISSUED), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      )
      .overrideProvider(MACHINE_ID_HASH)
      .useValue(() => null)
      // The real store protects the secret with Windows DPAPI via PowerShell,
      // which is far too slow to spawn per test.
      .overrideProvider(DEVICE_SECRET_STORE)
      .useValue(new InMemoryDeviceSecretStore())
      .compile();

    app = moduleRef.createNestApplication();
    app.use(helmet());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.CBT_DATA_DIR;
    delete process.env.TICKET_SIGNING_SECRET;
  });

  it('serves the setup page', async () => {
    const response = await request(app.getHttpServer()).get('/setup').expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('first-run setup');
  });

  it('reports an empty setup before anything is configured', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/setup/status').expect(200);

    expect(response.body).toMatchObject({
      setup_complete: false,
      activated: false,
      console_pin_set: false,
      school: null,
    });
    expect(response.body.server.url).toMatch(/^http:\/\/.+:8080$/);
  });

  it('rejects a malformed console PIN', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/setup/console-pin')
      .send({ pin: '12' })
      .expect(422);

    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('sets the console PIN once', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/setup/console-pin')
      .send({ pin: '123456' })
      .expect(200);
    expect(first.body.console_pin_set).toBe(true);

    const second = await request(app.getHttpServer())
      .post('/api/v1/setup/console-pin')
      .send({ pin: '654321' })
      .expect(409);
    expect(second.body.code).toBe('CONFLICT');
  });

  it('stores the school name', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/setup/school')
      .send({ name: 'Graceland College' })
      .expect(200);

    expect(response.body.school.name).toBe('Graceland College');
    expect(response.body.school.id).toBeNull();
  });

  it('stores the second backup location', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/setup/backup-path')
      .send({ path: backupDir })
      .expect(200);

    expect(response.body.second_backup_path).toBe(backupDir);
  });

  it('serves the lab shortcut files', async () => {
    const json = await request(app.getHttpServer()).get('/api/v1/setup/lab-shortcut').expect(200);
    expect(json.body.url).toMatch(/^http:\/\/.+:8080$/);

    const bat = await request(app.getHttpServer())
      .get('/api/v1/setup/lab-shortcut.bat')
      .expect(200);
    expect(bat.headers['content-disposition']).toContain('SchoolCBT-Exam.bat');
    expect(bat.text).toContain('set "SERVER=http');

    const url = await request(app.getHttpServer())
      .get('/api/v1/setup/lab-shortcut.url')
      .expect(200);
    expect(url.text).toContain('[InternetShortcut]');
  });

  it('activates the server and completes the setup', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/setup/activate')
      .send({
        activation_code: 'K7M2-9QXD-4TWH',
        device_name: 'Lab server',
        cloud_url: 'https://cloud.test',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      activated: true,
      device_id: 'dev-1',
      school: { id: 'school-1', name: 'Graceland College' },
    });

    const status = await request(app.getHttpServer()).get('/api/v1/setup/status').expect(200);
    expect(status.body).toMatchObject({
      setup_complete: true,
      activated: true,
      console_pin_set: true,
    });
    expect(status.body.setup_completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('refuses a second activation', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/setup/activate')
      .send({ activation_code: 'ANOTHER' })
      .expect(409);

    expect(response.body.code).toBe('CONFLICT');
  });
});
