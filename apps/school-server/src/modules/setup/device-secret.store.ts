import { Logger } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Injection token for the device-secret store. */
export const DEVICE_SECRET_STORE = Symbol('DEVICE_SECRET_STORE');

/**
 * Stores the sync secret issued at activation (API spec 13.3). The school
 * server signs every later sync request with it, so it must survive restarts
 * and must not sit in the SQLite database next to the data it protects.
 */
export interface DeviceSecretStore {
  save(secret: string): Promise<void>;
  load(): Promise<string | null>;
}

/** In-memory store, used by tests. */
export class InMemoryDeviceSecretStore implements DeviceSecretStore {
  private secret: string | null = null;

  async save(secret: string): Promise<void> {
    this.secret = secret;
  }

  async load(): Promise<string | null> {
    return this.secret;
  }
}

/** PowerShell that DPAPI-protects stdin (base64) at machine scope. */
const DPAPI_PROTECT = [
  'Add-Type -AssemblyName System.Security | Out-Null',
  '$raw = [Convert]::FromBase64String([Console]::In.ReadToEnd())',
  "$p = [Security.Cryptography.ProtectedData]::Protect($raw, $null, 'LocalMachine')",
  '[Console]::Out.Write([Convert]::ToBase64String($p))',
].join('; ');

/** PowerShell that reverses {@link DPAPI_PROTECT}. */
const DPAPI_UNPROTECT = [
  'Add-Type -AssemblyName System.Security | Out-Null',
  '$raw = [Convert]::FromBase64String([Console]::In.ReadToEnd())',
  "$p = [Security.Cryptography.ProtectedData]::Unprotect($raw, $null, 'LocalMachine')",
  '[Console]::Out.Write([Convert]::ToBase64String($p))',
].join('; ');

/**
 * Stores the secret in `<dataDir>/secrets/device.bin`, protected with Windows
 * DPAPI at machine scope (spec 6.1 and 13.3). Where DPAPI is unavailable —
 * a non-Windows host, or PowerShell blocked by policy — it falls back to the
 * raw bytes and logs a warning so the server still activates.
 */
export class DpapiDeviceSecretStore implements DeviceSecretStore {
  constructor(
    private readonly filePath: string,
    private readonly logger: Logger,
  ) {}

  async save(secret: string): Promise<void> {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, this.protect(secret), { mode: 0o600 });
  }

  async load(): Promise<string | null> {
    if (!existsSync(this.filePath)) return null;
    return this.unprotect(readFileSync(this.filePath, 'utf8'));
  }

  private protect(secret: string): string {
    if (process.platform !== 'win32') return secret;
    try {
      const input = Buffer.from(secret, 'utf8').toString('base64');
      const out = execFileSync('powershell.exe', dpapiArgs(DPAPI_PROTECT), {
        input,
        encoding: 'utf8',
      }).trim();
      return `dpapi:${out}`;
    } catch (error) {
      this.logger.warn(
        `DPAPI unavailable, storing the device secret unprotected: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'DeviceSecretStore',
      );
      return secret;
    }
  }

  private unprotect(stored: string): string {
    if (!stored.startsWith('dpapi:')) return stored;
    const out = execFileSync('powershell.exe', dpapiArgs(DPAPI_UNPROTECT), {
      input: stored.slice('dpapi:'.length),
      encoding: 'utf8',
    }).trim();
    return Buffer.from(out, 'base64').toString('utf8');
  }
}

function dpapiArgs(script: string): string[] {
  return ['-NoProfile', '-NonInteractive', '-Command', script];
}

/** Default store for a school server rooted at `dataDir`. */
export function createDeviceSecretStore(dataDir: string, logger: Logger): DeviceSecretStore {
  return new DpapiDeviceSecretStore(join(dataDir, 'secrets', 'device.bin'), logger);
}
