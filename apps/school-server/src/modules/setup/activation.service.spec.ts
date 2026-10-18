import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpException } from '@nestjs/common';
import type { SchoolConfigService } from '../../common/config/school-config.service';
import { DrizzleMetaRepository } from '../exam/repositories/drizzle-meta.repository';
import { META_KEYS } from '../exam/repositories/meta.repository';
import { createInMemoryDb, type InMemoryDb } from '../sync/testing/in-memory-db';
import { ActivationService } from './activation.service';
import { InMemoryDeviceSecretStore } from './device-secret.store';

const ISSUED = {
  device_id: 'dev-1',
  key_id: 'k-1',
  secret: 's3cret',
  school: { id: 'school-1', code: 'GRC', name: 'Graceland College' },
  cloud_signing_key: { key_id: 'cloud-1', public_key: 'PUBKEY' },
  initial_cursor: 42,
  sync_interval_seconds: 600,
  restore_available: true,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ActivationService', () => {
  let memory: InMemoryDb;
  let meta: DrizzleMetaRepository;
  let secrets: InMemoryDeviceSecretStore;
  let http: ReturnType<typeof vi.fn>;

  function build(cloudUrl: string | null = 'https://cloud.test') {
    const config = {
      port: 8080,
      dataDir: 'unused',
      cloudSyncUrl: cloudUrl ?? undefined,
    } as unknown as SchoolConfigService;
    return new ActivationService(
      meta,
      secrets,
      http as unknown as typeof fetch,
      () => null,
      config,
    );
  }

  /** The problem code carried by a rejected request. */
  async function codeOf(promise: Promise<unknown>): Promise<unknown> {
    const error = (await promise.catch((caught: unknown) => caught)) as HttpException;
    return (error.getResponse() as { code?: unknown }).code;
  }

  beforeEach(async () => {
    memory = await createInMemoryDb();
    meta = new DrizzleMetaRepository(memory.service);
    secrets = new InMemoryDeviceSecretStore();
    http = vi.fn(async () => json(ISSUED));
  });

  afterEach(() => {
    memory.close();
  });

  it('registers the server and stores the issued identity', async () => {
    const result = await build().activate({ code: 'K7M2-9QXD-4TWH', deviceName: 'Lab server' });

    expect(result).toMatchObject({
      activated: true,
      cloud_url: 'https://cloud.test',
      device_id: 'dev-1',
      device_name: 'Lab server',
      school: { id: 'school-1', name: 'Graceland College' },
      restore_available: true,
      sync_interval_seconds: 600,
    });

    expect(await meta.get(META_KEYS.deviceId)).toBe('dev-1');
    expect(await meta.get(META_KEYS.deviceKeyId)).toBe('k-1');
    expect(await meta.get(META_KEYS.schoolId)).toBe('school-1');
    expect(await meta.get(META_KEYS.schoolName)).toBe('Graceland College');
    expect(await meta.get(META_KEYS.cloudUrl)).toBe('https://cloud.test');
    expect(await meta.get(META_KEYS.cloudPublicKey)).toBe('PUBKEY');
    expect(await meta.get(META_KEYS.syncIntervalSeconds)).toBe('600');
    expect(await meta.get(META_KEYS.initialCursor)).toBe('42');
    expect(await secrets.load()).toBe('s3cret');
  });

  it('posts the activation request to the cloud sync endpoint', async () => {
    await build().activate({ code: 'CODE-1', deviceName: 'Lab server' });

    const [url, init] = http.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://cloud.test/api/v1/sync/v1/activate');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.activation_code).toBe('CODE-1');
    expect(body.device_name).toBe('Lab server');
    expect(typeof body.software_version).toBe('string');
    expect(body.platform).toMatchObject({ os: expect.any(String), arch: expect.any(String) });
  });

  it('trims a trailing slash from the cloud URL', async () => {
    await build('https://cloud.test///').activate({ code: 'CODE-1' });
    expect(http.mock.calls[0]?.[0]).toBe('https://cloud.test/api/v1/sync/v1/activate');
  });

  it('refuses to activate a server that already has a device identity', async () => {
    await meta.set(META_KEYS.deviceId, 'dev-existing');

    expect(await codeOf(build().activate({ code: 'CODE-1' }))).toBe('CONFLICT');
    expect(http).not.toHaveBeenCalled();
  });

  it('refuses to activate without a cloud URL', async () => {
    expect(await codeOf(build(null).activate({ code: 'CODE-1' }))).toBe('CONFLICT');
  });

  it('maps cloud rejections onto the catalogue', async () => {
    http.mockResolvedValueOnce(json({ code: 'ACTIVATION_CODE_EXPIRED' }, 410));
    expect(await codeOf(build().activate({ code: 'CODE-1' }))).toBe('ACTIVATION_CODE_EXPIRED');

    http.mockResolvedValueOnce(json({}, 404));
    expect(await codeOf(build().activate({ code: 'CODE-1' }))).toBe('ACTIVATION_CODE_INVALID');

    http.mockResolvedValueOnce(json({}, 410));
    expect(await codeOf(build().activate({ code: 'CODE-1' }))).toBe('ACTIVATION_CODE_USED');
  });

  it('reports an unreachable cloud', async () => {
    http.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));

    expect(await codeOf(build().activate({ code: 'CODE-1' }))).toBe('CONFLICT');
    expect(await meta.get(META_KEYS.deviceId)).toBeNull();
  });

  it('rejects a malformed activation response', async () => {
    http.mockResolvedValueOnce(json({ device_id: 'dev-1' }));

    expect(await codeOf(build().activate({ code: 'CODE-1' }))).toBe('CONFLICT');
    expect(await meta.get(META_KEYS.deviceId)).toBeNull();
  });
});
