import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Logger } from '@nestjs/common';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DpapiDeviceSecretStore, InMemoryDeviceSecretStore } from './device-secret.store';

/** Spawning PowerShell to reach DPAPI takes seconds; give it room under load. */
const DPAPI_TIMEOUT_MS = 30_000;

describe('DeviceSecretStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cbt-secret-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the secret in memory', async () => {
    const store = new InMemoryDeviceSecretStore();

    expect(await store.load()).toBeNull();
    await store.save('s3cret');
    expect(await store.load()).toBe('s3cret');
  });

  it('returns null before anything has been saved', async () => {
    const store = new DpapiDeviceSecretStore(join(dir, 'device.bin'), new Logger());

    expect(await store.load()).toBeNull();
  });

  it.runIf(process.platform === 'win32')(
    'protects the secret with DPAPI at machine scope and restores it',
    async () => {
      const path = join(dir, 'secrets', 'device.bin');
      const store = new DpapiDeviceSecretStore(path, new Logger());

      await store.save('s3cret-value');

      // The file on disk must not contain the secret in the clear.
      const onDisk = readFileSync(path, 'utf8');
      expect(onDisk.startsWith('dpapi:')).toBe(true);
      expect(onDisk).not.toContain('s3cret-value');

      expect(await store.load()).toBe('s3cret-value');
    },
    DPAPI_TIMEOUT_MS,
  );
});
