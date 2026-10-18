import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { accessSync, constants, mkdirSync } from 'node:fs';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { problem } from '../../common/http/problem';
import {
  META_KEYS,
  META_REPOSITORY,
  type MetaRepository,
} from '../exam/repositories/meta.repository';
import { serverAddress, type ServerAddress } from './network';

/** Progress of the first-run wizard (spec 6.3 step 8). */
export interface SetupStatus {
  setup_complete: boolean;
  activated: boolean;
  console_pin_set: boolean;
  school: { id: string | null; name: string } | null;
  second_backup_path: string | null;
  cloud_url: string | null;
  server: ServerAddress;
  setup_completed_at: string | null;
}

/** Files the operator copies to every lab PC (spec 6.6). */
export interface LabShortcut {
  url: string;
  bat: string;
  url_file: string;
  bat_filename: string;
}

/**
 * Backs the `/setup` first-run page: the console PIN, the school name, the
 * second backup location and the lab shortcut. Activation itself lives in
 * {@link ActivationService}; this service only reads the state it leaves behind.
 */
@Injectable()
export class SetupService {
  constructor(
    @Inject(META_REPOSITORY) private readonly meta: MetaRepository,
    private readonly config: SchoolConfigService,
  ) {}

  async getStatus(): Promise<SetupStatus> {
    const [schoolId, schoolName, pinHash, backupPath, cloudUrl, deviceId, completedAt] =
      await Promise.all([
        this.meta.get(META_KEYS.schoolId),
        this.meta.get(META_KEYS.schoolName),
        this.meta.get(META_KEYS.consolePinHash),
        this.meta.get(META_KEYS.secondBackupPath),
        this.meta.get(META_KEYS.cloudUrl),
        this.meta.get(META_KEYS.deviceId),
        this.meta.get(META_KEYS.setupCompletedAt),
      ]);

    const activated = Boolean(deviceId);
    const consolePinSet = Boolean(pinHash);
    const known = Boolean(schoolId ?? schoolName);

    return {
      setup_complete: activated && consolePinSet,
      activated,
      console_pin_set: consolePinSet,
      school: known ? { id: schoolId, name: schoolName ?? '' } : null,
      second_backup_path: backupPath,
      cloud_url: cloudUrl ?? this.config.cloudSyncUrl ?? null,
      server: serverAddress(this.config.port),
      setup_completed_at: completedAt,
    };
  }

  /** Set the initial console PIN. Only valid while no PIN exists (spec 6.3). */
  async setConsolePin(pin: string): Promise<SetupStatus> {
    if (await this.meta.get(META_KEYS.consolePinHash)) {
      throw problem('CONFLICT', 'Console PIN is already set; change it from the console instead');
    }
    await this.meta.set(META_KEYS.consolePinHash, await argon2.hash(pin));
    await this.markCompleteIfReady();
    return this.getStatus();
  }

  /** Record the school name shown on the console header. */
  async setSchoolName(name: string): Promise<SetupStatus> {
    await this.meta.set(META_KEYS.schoolName, name);
    return this.getStatus();
  }

  /**
   * Record the second backup location (spec 6.3). The directory must already be
   * writable — typically a USB drive or a mapped network share — so the operator
   * finds out at setup time rather than at the first backup.
   */
  async setBackupPath(path: string): Promise<SetupStatus> {
    try {
      mkdirSync(path, { recursive: true });
      accessSync(path, constants.W_OK);
    } catch {
      throw problem('VALIDATION_FAILED', `Backup path is not writable: ${path}`);
    }
    await this.meta.set(META_KEYS.secondBackupPath, path);
    return this.getStatus();
  }

  /** Lab shortcut files, generated from the server's LAN address (spec 6.6). */
  async getLabShortcut(): Promise<LabShortcut> {
    const { url } = (await this.getStatus()).server;
    return {
      url,
      url_file: internetShortcut(url),
      bat: kioskBat(url),
      bat_filename: 'SchoolCBT-Exam.bat',
    };
  }

  /** Stamp `setup_completed_at` once activation and the PIN are both done. */
  async markCompleteIfReady(): Promise<void> {
    const [deviceId, pinHash, completedAt] = await Promise.all([
      this.meta.get(META_KEYS.deviceId),
      this.meta.get(META_KEYS.consolePinHash),
      this.meta.get(META_KEYS.setupCompletedAt),
    ]);
    if (deviceId && pinHash && !completedAt) {
      await this.meta.set(META_KEYS.setupCompletedAt, new Date().toISOString());
    }
  }
}

/** Windows internet shortcut (`SchoolCBT-Exam.url`), matching the installer tools. */
export function internetShortcut(url: string): string {
  return ['[InternetShortcut]', `URL=${url}/`, ''].join('\r\n');
}

/** Kiosk launcher (`SchoolCBT-Exam.bat`), matching `tools/write-lab-shortcut.ps1`. */
export function kioskBat(url: string): string {
  return [
    '@echo off',
    'rem School CBT exam client. Seat label comes from the PC name.',
    'setlocal',
    `set "SERVER=${url}"`,
    'set "SEAT=%COMPUTERNAME%"',
    'set "PROFILE=%LOCALAPPDATA%\\SchoolCBT\\browser"',
    '',
    'set "BROWSER="',
    'if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
    'if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined BROWSER if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"',
    'if not defined BROWSER if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"',
    '',
    'if not defined BROWSER (',
    '  echo Could not find Chrome or Edge. Opening the default browser instead.',
    '  start "" "%SERVER%/?seat=%SEAT%"',
    '  exit /b 0',
    ')',
    '',
    '"%BROWSER%" --kiosk --disable-pinch --overscroll-history-navigation=0 --user-data-dir="%PROFILE%" "%SERVER%/?seat=%SEAT%"',
    '',
  ].join('\r\n');
}
