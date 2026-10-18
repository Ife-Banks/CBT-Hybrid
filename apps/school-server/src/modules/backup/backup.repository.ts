/** Injection token for the backup log (CBT-Database-Architecture `backup_log`). */
export const BACKUP_REPOSITORY = Symbol('BACKUP_REPOSITORY');

/** One row of the backup log. */
export interface BackupRecord {
  at: string;
  path: string;
  bytes: number | null;
  sha256: string | null;
  ok: boolean;
}

/** Append-only record of the backups this server has taken (US-15.4). */
export interface BackupRepository {
  record(entry: BackupRecord): Promise<void>;
  /** Newest first. */
  list(limit: number): Promise<BackupRecord[]>;
  /** The newest entry, whether or not it succeeded. */
  latest(): Promise<BackupRecord | null>;
}
