import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { arch, platform, release } from 'node:os';
import { VERSION } from '@cbt/shared-types';

/** Platform block for the activation request (API spec 13.3). */
export interface PlatformInfo {
  os: string;
  os_version: string;
  arch: string;
}

/** Software version reported to the cloud at activation and in heartbeats. */
export function softwareVersion(): string {
  return VERSION;
}

export function platformInfo(): PlatformInfo {
  return { os: platform(), os_version: release(), arch: arch() };
}

/** Injection token for the machine-id hash used at activation (`machineIdHash`). */
export const MACHINE_ID_HASH = Symbol('MACHINE_ID_HASH');

/**
 * SHA-256 of the Windows `MachineGuid`, which the cloud uses to spot a cloned
 * install (API spec 13.3). Returns `null` when it cannot be read — non-Windows,
 * or the registry value is missing — so the caller can omit the field rather
 * than send a misleading hash. Cached: reading it spawns PowerShell.
 */
export function machineIdHash(): string | null {
  if (cachedMachineId === undefined) {
    cachedMachineId = readMachineId();
  }
  return cachedMachineId;
}

let cachedMachineId: string | null | undefined;

function readMachineId(): string | null {
  if (platform() !== 'win32') return null;
  try {
    const guid = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid",
      ],
      { encoding: 'utf8' },
    ).trim();
    if (!guid) return null;
    return createHash('sha256').update(guid).digest('hex');
  } catch {
    return null;
  }
}
