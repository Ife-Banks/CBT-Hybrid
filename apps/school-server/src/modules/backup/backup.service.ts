import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { backupName } from '../../common/fs/backup-name';
import { problem } from '../../common/http/problem';
import { ELEVATION_RUNNER, type ElevationRunner } from '../../common/process/elevation.runner';
import { DrizzleSqliteService } from '../../shared/database/drizzle-sqlite.service';
import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from '../exam/repositories/catalog.repository';
import {
  META_KEYS,
  META_REPOSITORY,
  type MetaRepository,
} from '../exam/repositories/meta.repository';
import { BACKUP_REPOSITORY, type BackupRepository } from './backup.repository';

/** A restore must leave the server healthy within this many seconds (spec 6.4). */
export const RESTORE_HEALTH_TIMEOUT_SECONDS = 60;

/** A sitting starting within this window blocks a restore, as it blocks an update. */
export const RESTORE_BLOCK_WINDOW_MS = 2 * 60 * 60 * 1000;

/** How many entries the back up listing returns. */
const LIST_LIMIT = 60;

/** What caused a backup; recorded in the log line only. */
export type BackupTrigger = 'sitting' | 'nightly' | 'manual';

/** Where a backup file lives. */
export type BackupLocation = 'local' | 'pre_update' | 'pre_migration' | 'pre_restore' | 'second';

/** A backup file the console can show or restore. */
export interface BackupEntry {
  name: string;
  path: string;
  location: BackupLocation;
  at: string;
  bytes: number | null;
  sha256: string | null;
  ok: boolean;
  exists: boolean;
}

export interface BackupStatus {
  local_dir: string;
  second_backup_path: string | null;
  second_backup_writable: boolean;
  retention: number;
  nightly_hour: number;
  last_backup: { at: string; ok: boolean } | null;
  backups: BackupEntry[];
}

/** What the elevated restore helper reported last time it ran. */
export interface RestoreResult {
  status: 'restored' | 'restore_failed';
  source: string;
  at: string;
  safety_copy: string | null;
  detail?: string | null;
}

export type RestoreBlockedReason = 'sitting_open' | 'sitting_due';

export interface RestoreStatus {
  can_restore: boolean;
  blocked_reason: RestoreBlockedReason | null;
  blocked_sitting_id: string | null;
  candidates: BackupEntry[];
  last_result: RestoreResult | null;
  /** Helper the operator can run as administrator when elevation is refused. */
  command_file: string | null;
  elevation_command: string | null;
}

/**
 * Backups and restores (CBT-04 sections 6.1 and 6.6, US-15.4 and US-15.5).
 *
 * Backups run after each sitting and nightly, go to `<dataRoot>/backups` and to
 * the configured second location, are checksummed and are kept to the latest
 * `BACKUP_RETENTION`. A restore can only be done with the service stopped, so
 * this service validates the source, refuses while a sitting is open or due, and
 * hands a helper batch file to the elevated `tools/restore-backup.ps1`, which
 * takes a safety copy before it overwrites the database.
 */
@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(BACKUP_REPOSITORY) private readonly backups: BackupRepository,
    @Inject(META_REPOSITORY) private readonly meta: MetaRepository,
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(ELEVATION_RUNNER) private readonly elevation: ElevationRunner,
    private readonly drizzle: DrizzleSqliteService,
    private readonly config: SchoolConfigService,
  ) {}

  onModuleInit(): void {
    const minutes = this.config.backupCheckMinutes;
    if (minutes <= 0) return;
    this.timer = setInterval(() => void this.runScheduledBackup(), minutes * 60_000);
    // Never hold the process open just for the backup timer.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** The current time. Overridden in tests so the nightly timer is deterministic. */
  protected now(): Date {
    return new Date();
  }

  async getStatus(): Promise<BackupStatus> {
    const second = await this.secondBackupPath();
    return {
      local_dir: this.config.backupsDir,
      second_backup_path: second,
      second_backup_writable: second ? isWritable(second) : false,
      retention: this.config.backupRetention,
      nightly_hour: this.config.backupHour,
      last_backup: await this.lastBackup(),
      backups: await this.listBackups(),
    };
  }

  /** The newest entry in the log, for the heartbeat's `last_backup_*` fields. */
  async lastBackup(): Promise<{ at: string; ok: boolean } | null> {
    const latest = await this.backups.latest();
    return latest ? { at: latest.at, ok: latest.ok } : null;
  }

  /**
   * Take a consistent copy of the live database (the SQLite backup API), copy it
   * to the second location when one is configured, log it and prune the folder.
   */
  async createBackup(trigger: BackupTrigger = 'manual'): Promise<BackupEntry> {
    const directory = this.config.backupsDir;
    mkdirSync(directory, { recursive: true });

    const target = uniquePath(directory, backupName('school'));
    try {
      await this.drizzle.backupTo(target);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.recordFailure(target, detail);
      throw problem('CONFLICT', `Could not back up the database: ${detail}`);
    }

    const bytes = sizeOf(target);
    const sha256 = await sha256File(target);
    const at = this.now().toISOString();

    await this.copyToSecondLocation(target);
    await this.backups.record({ at, path: target, bytes, sha256, ok: true });
    this.pruneLocalBackups();

    this.logger.log(`Backup (${trigger}) written: ${target} (${bytes ?? 0} bytes)`);
    return {
      name: basename(target),
      path: target,
      location: 'local',
      at,
      bytes,
      sha256,
      ok: true,
      exists: true,
    };
  }

  /** Every backup file the console can offer, newest first. */
  async listBackups(): Promise<BackupEntry[]> {
    const roots: Array<{ dir: string; location: BackupLocation }> = [
      { dir: this.config.backupsDir, location: 'local' },
      { dir: this.config.preUpdateBackupsDir, location: 'pre_update' },
      { dir: this.config.preMigrationBackupsDir, location: 'pre_migration' },
      { dir: this.config.preRestoreBackupsDir, location: 'pre_restore' },
    ];
    const second = await this.secondBackupPath();
    if (second) roots.push({ dir: second, location: 'second' });

    const logged = new Map(
      (await this.backups.list(200)).map((entry) => [pathKey(entry.path), entry]),
    );

    const entries: BackupEntry[] = [];
    for (const { dir, location } of roots) {
      for (const file of listDatabaseFiles(dir)) {
        const path = join(dir, file);
        const stats = statOf(path);
        const record = logged.get(pathKey(path));
        entries.push({
          name: file,
          path,
          location:
            location === 'local' && file.startsWith('pre-update-') ? 'pre_update' : location,
          at: record?.at ?? stats?.mtime.toISOString() ?? '',
          bytes: stats?.size ?? record?.bytes ?? null,
          sha256: record?.sha256 ?? null,
          ok: record?.ok ?? true,
          exists: stats !== null,
        });
      }
    }

    return entries.sort(newestFirst).slice(0, LIST_LIMIT);
  }

  /** Restore state: what can be restored and what is in the way. */
  async getRestoreStatus(): Promise<RestoreStatus> {
    const [candidates, blocking] = await Promise.all([this.listBackups(), this.blockingSitting()]);
    const commandFile = this.restoreCommandFile();
    const blockedReason = blocking
      ? blocking.status === 'open'
        ? ('sitting_open' as const)
        : ('sitting_due' as const)
      : null;

    return {
      can_restore: blockedReason === null && candidates.length > 0,
      blocked_reason: blockedReason,
      blocked_sitting_id: blocking?.id ?? null,
      candidates,
      last_result: this.readRestoreResult(),
      command_file: existsSync(commandFile) ? commandFile : null,
      elevation_command: this.restoreElevationCommand(),
    };
  }

  /**
   * Replace the live database with a backup. Refused while a sitting is open or
   * starts within two hours, because the service has to stop for the copy.
   */
  async restore(
    source: string,
  ): Promise<{ status: 'restoring'; source: string; command_file: string; safety_dir: string }> {
    const backup = await this.resolveRestoreSource(source);

    const blocking = await this.blockingSitting();
    if (blocking) {
      throw problem(
        'CONFLICT',
        `Restores are blocked while sitting ${blocking.id} is ${blocking.status}`,
      );
    }

    const commandFile = this.writeRestoreCommand(backup);
    const outcome = await this.elevation.run({ commandFile });
    if (!outcome.started) {
      throw problem('CONFLICT', outcome.reason ?? 'Could not start the restore');
    }

    this.logger.log(`Restore started from ${backup}`);
    return {
      status: 'restoring',
      source: backup,
      command_file: commandFile,
      safety_dir: this.config.preRestoreBackupsDir,
    };
  }

  /**
   * The nightly pass (US-15.4): back up once, the first time the server notices
   * it is past the backup hour and has not backed up today. Called by the timer;
   * also safe to call by hand.
   */
  async runScheduledBackup(): Promise<void> {
    try {
      if (this.now().getHours() < this.config.backupHour) return;
      if (await this.backedUpToday()) return;
      await this.createBackup('nightly');
    } catch (error) {
      this.logger.warn(
        `Nightly backup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async backedUpToday(): Promise<boolean> {
    const latest = await this.backups.latest();
    if (!latest?.ok) return false;
    const at = new Date(latest.at);
    const now = this.now();
    return (
      at.getFullYear() === now.getFullYear() &&
      at.getMonth() === now.getMonth() &&
      at.getDate() === now.getDate()
    );
  }

  /** Validate a restore source and return its absolute path. */
  private async resolveRestoreSource(source: string): Promise<string> {
    const value = String(source ?? '').trim();
    if (!value) throw problem('VALIDATION_FAILED', 'A backup file is required');

    const roots = await this.restoreRoots();
    let candidate: string | null = null;
    if (isAbsolute(value)) {
      candidate = resolve(value);
    } else {
      candidate =
        roots.map((root) => resolve(root, value)).find((path) => existsSync(path)) ?? null;
      if (!candidate) {
        throw problem('NOT_FOUND', `No backup named ${value} in the backup folders`);
      }
    }

    if (!candidate.toLowerCase().endsWith('.db')) {
      throw problem('VALIDATION_FAILED', 'Restores accept SQLite .db backup files only');
    }
    if (!existsSync(candidate)) {
      throw problem('NOT_FOUND', `Backup not found: ${candidate}`);
    }
    if (!roots.some((root) => isInside(root, candidate))) {
      throw problem(
        'VALIDATION_FAILED',
        `Copy the backup into ${this.config.backupsDir} first, then restore it by name`,
      );
    }
    return candidate;
  }

  /** Folders a restore may read from. */
  private async restoreRoots(): Promise<string[]> {
    const second = await this.secondBackupPath();
    return [
      this.config.backupsDir,
      this.config.preUpdateBackupsDir,
      this.config.preMigrationBackupsDir,
      this.config.preRestoreBackupsDir,
      ...(second ? [second] : []),
    ];
  }

  private async blockingSitting() {
    return this.catalog.findBlockingSitting(
      new Date(Date.now() + RESTORE_BLOCK_WINDOW_MS).toISOString(),
    );
  }

  private async secondBackupPath(): Promise<string | null> {
    const value = (await this.meta.get(META_KEYS.secondBackupPath))?.trim();
    return value ? resolve(value) : null;
  }

  /** Copy a fresh backup to the second location; never fail the backup for it. */
  private async copyToSecondLocation(path: string): Promise<void> {
    const second = await this.secondBackupPath();
    if (!second) return;
    try {
      mkdirSync(second, { recursive: true });
      copyFileSync(path, join(second, basename(path)));
    } catch (error) {
      this.logger.warn(
        `Could not copy the backup to ${second}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async recordFailure(path: string, detail: string): Promise<void> {
    const bytes = sizeOf(path);
    await this.backups.record({
      at: this.now().toISOString(),
      path,
      bytes,
      sha256: bytes === null ? null : await sha256File(path),
      ok: false,
    });
    this.logger.warn(`Backup failed: ${detail}`);
  }

  /** Keep the newest `BACKUP_RETENTION` managed backups; leave the rest alone. */
  private pruneLocalBackups(): void {
    const directory = this.config.backupsDir;
    const managed = listDatabaseFiles(directory)
      .filter((name) => name.startsWith('school-'))
      .sort(backupNameOrder);
    for (const name of managed.slice(this.config.backupRetention)) {
      rmSync(join(directory, name), { force: true });
      rmSync(join(directory, `${name}-wal`), { force: true });
      rmSync(join(directory, `${name}-shm`), { force: true });
    }
  }

  private restoreResultFile(): string {
    return join(this.config.backupsDir, 'last-restore.json');
  }

  private restoreCommandFile(): string {
    return join(this.config.backupsDir, 'SchoolCBT-Restore.cmd');
  }

  private restoreElevationCommand(): string {
    return `powershell -Command "Start-Process -Verb RunAs '${this.restoreCommandFile()}'"`;
  }

  /** Reads what the restore helper wrote after its last run. */
  private readRestoreResult(): RestoreResult | null {
    const path = this.restoreResultFile();
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as RestoreResult;
    } catch {
      this.logger.warn(`Ignoring unreadable restore result at ${path}`);
      return null;
    }
  }

  /**
   * Writes the batch file that runs the restore. It is both what the elevation
   * prompt launches and the fallback the operator can double-click.
   */
  private writeRestoreCommand(backup: string): string {
    const path = this.restoreCommandFile();
    mkdirSync(this.config.backupsDir, { recursive: true });
    const line = [
      'powershell -NoProfile -ExecutionPolicy Bypass',
      `-File "${this.config.restoreScript}"`,
      `-Backup "${backup}"`,
      `-DataDir "${this.config.dataDir}"`,
      `-ServiceName "SchoolCBT"`,
      `-Port ${this.config.port}`,
      `-HealthTimeoutSeconds ${RESTORE_HEALTH_TIMEOUT_SECONDS}`,
      `-ResultFile "${this.restoreResultFile()}"`,
    ].join(' ');
    const script = [
      '@echo off',
      'rem Restores a School CBT database backup. Requires administrator rights.',
      'rem Written by the exam server; safe to delete once the restore is done.',
      line,
      '',
    ].join('\r\n');
    writeFileSync(path, script, 'utf8');
    return path;
  }
}

/** `school-20261018-221530.db`, with a counter when two land in the same second. */
function uniquePath(directory: string, name: string): string {
  const first = join(directory, name);
  if (!existsSync(first)) return first;
  for (let suffix = 1; ; suffix += 1) {
    const candidate = join(directory, `${name.slice(0, -3)}-${suffix}.db`);
    if (!existsSync(candidate)) return candidate;
  }
}

/** `*.db` files in a folder, sorted by name. */
function listDatabaseFiles(directory: string): string[] {
  try {
    return readdirSync(directory)
      .filter((name) => name.toLowerCase().endsWith('.db'))
      .sort();
  } catch {
    return [];
  }
}

function statOf(path: string): { size: number; mtime: Date } | null {
  try {
    const stats = statSync(path);
    return stats.isFile() ? { size: stats.size, mtime: stats.mtime } : null;
  } catch {
    return null;
  }
}

function sizeOf(path: string): number | null {
  return statOf(path)?.size ?? null;
}

async function sha256File(path: string): Promise<string | null> {
  try {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    return hash.digest('hex');
  } catch {
    return null;
  }
}

/** Newest first, by timestamp then name. */
function newestFirst(left: BackupEntry, right: BackupEntry): number {
  if (left.at !== right.at) return left.at < right.at ? 1 : -1;
  return left.name < right.name ? 1 : -1;
}

/**
 * Newest first for `school-<stamp>[-n].db` names, so pruning keeps the newest
 * even when several land in the same second.
 */
function backupNameOrder(left: string, right: string): number {
  const a = parseBackupName(left);
  const b = parseBackupName(right);
  if (a && b) {
    if (a.stamp !== b.stamp) return a.stamp < b.stamp ? 1 : -1;
    return b.suffix - a.suffix;
  }
  return left < right ? 1 : -1;
}

function parseBackupName(name: string): { stamp: string; suffix: number } | null {
  const match = /^school-(\d{8}-\d{6})(?:-(\d+))?\.db$/i.exec(name);
  const stamp = match?.[1];
  if (!stamp) return null;
  return { stamp, suffix: Number(match?.[2] ?? 0) };
}

/** Case-insensitive on Windows, exact elsewhere. */
function pathKey(path: string): string {
  const resolved = resolve(path);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** Whether `candidate` sits inside `root`. */
function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/** Whether the operator can write to a folder. */
function isWritable(directory: string): boolean {
  try {
    mkdirSync(directory, { recursive: true });
    accessSync(directory, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
