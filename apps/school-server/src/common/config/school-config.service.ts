import { Injectable } from '@nestjs/common';
import { dirname, join, resolve } from 'node:path';
import { EXAM_PACK_FOLDERS, SchoolEnv, loadSchoolEnv } from './school-config';

/** Placeholder secret used outside production when `TICKET_SIGNING_SECRET` is unset. */
const DEV_TICKET_SIGNING_SECRET = 'development-only-ticket-secret-do-not-use';

/** Typed access to school-server configuration and derived paths. */
@Injectable()
export class SchoolConfigService {
  private readonly env: SchoolEnv;

  constructor() {
    this.env = loadSchoolEnv(process.env);
  }

  get<K extends keyof SchoolEnv>(key: K): SchoolEnv[K] {
    return this.env[key];
  }

  /** Whether the server should operate in offline mode. */
  public isOfflineMode(): boolean {
    return this.env.OFFLINE_MODE;
  }

  /** Port to bind, preferring the local `SCHOOL_SERVER_PORT` override. */
  get port(): number {
    return this.env.SCHOOL_SERVER_PORT ?? this.env.PORT;
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  /** Cloud sync URL for the sync agent. */
  get cloudSyncUrl(): string | undefined {
    return this.env.cloudSyncUrl;
  }

  /**
   * Secret for signing login tickets. Falls back to a development-only value so
   * the server starts without configuration; production must set
   * `TICKET_SIGNING_SECRET`.
   */
  get ticketSigningSecret(): string {
    return this.env.TICKET_SIGNING_SECRET ?? DEV_TICKET_SIGNING_SECRET;
  }

  /** Absolute path of the data directory. */
  get dataDir(): string {
    return resolve(this.env.CBT_DATA_DIR);
  }

  /** Absolute path of the SQLite database file. */
  get dbPath(): string {
    return join(this.dataDir, 'school.db');
  }

  /** Absolute path of the exam-pack root. */
  get examPacksDir(): string {
    return join(this.dataDir, 'exam-packs');
  }

  /** Directory holding downloaded update packages and the updater's result file. */
  get updatesDir(): string {
    return join(this.dataDir, 'updates');
  }

  /**
   * Local backup folder (CBT-04 section 6.1). It is a sibling of the data
   * folder — `C:\ProgramData\SchoolCBT\backups` — which is where the installer
   * and the update/restore helpers already write.
   */
  get backupsDir(): string {
    return join(dirname(this.dataDir), 'backups');
  }

  /** Database copies the installer and the updater take before they change anything. */
  get preUpdateBackupsDir(): string {
    return join(this.backupsDir, 'pre-update');
  }

  /** Database copies taken before a schema migration runs (CBT-04 section 5.9). */
  get preMigrationBackupsDir(): string {
    return join(this.backupsDir, 'pre-migration');
  }

  /** Database copies taken before a restore overwrites the live database. */
  get preRestoreBackupsDir(): string {
    return join(this.backupsDir, 'pre-restore');
  }

  /** Minutes between background backup checks; 0 disables the nightly timer. */
  get backupCheckMinutes(): number {
    return this.env.BACKUP_CHECK_MINUTES;
  }

  /** How many local backups to keep. */
  get backupRetention(): number {
    return this.env.BACKUP_RETENTION;
  }

  /** Local hour of the nightly backup. */
  get backupHour(): number {
    return this.env.BACKUP_HOUR;
  }

  /** Restore script shipped by the installer (CBT-04 section 6.6). */
  get restoreScript(): string {
    return join(this.installDir, 'tools', 'restore-backup.ps1');
  }

  /** Whether the server applies a staged update automatically between sittings. */
  get autoUpdate(): boolean {
    return this.env.AUTO_UPDATE;
  }

  /** Minutes between background update checks; 0 disables them. */
  get updateCheckMinutes(): number {
    return this.env.UPDATE_CHECK_MINUTES;
  }

  /** Install root holding `node.exe`, `app/` and `tools/`. */
  get installDir(): string {
    const fallback = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'SchoolCBT');
    return this.env.UPDATE_INSTALL_DIR ?? fallback;
  }

  /** Updater script shipped by the installer (CBT-04 section 6.4). */
  get updaterScript(): string {
    return join(this.installDir, 'tools', 'apply-update.ps1');
  }

  /** Absolute paths of the four exam-pack folders. */
  get examPackFolders(): Record<(typeof EXAM_PACK_FOLDERS)[number], string> {
    return EXAM_PACK_FOLDERS.reduce(
      (folders, name) => {
        folders[name] = join(this.examPacksDir, name);
        return folders;
      },
      {} as Record<(typeof EXAM_PACK_FOLDERS)[number], string>,
    );
  }
}
