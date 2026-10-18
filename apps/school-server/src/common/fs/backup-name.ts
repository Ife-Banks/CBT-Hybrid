/**
 * Backup file names. The spec used them for the cloud upload (API spec 13.9,
 * `school-YYYYMMDD-HHmmss.db.gz`) and the same shape is convenient locally
 * because it sorts chronologically.
 */

/** `yyyyMMdd-HHmmss` in local time. */
export function backupStamp(at: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
    `-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  );
}

/** `<prefix>-<stamp>.db`, for example `school-20261018-221530.db`. */
export function backupName(prefix: string, at: Date = new Date()): string {
  return `${prefix}-${backupStamp(at)}.db`;
}

/** The database files WAL mode keeps alongside `school.db`. */
export function sidecarPaths(dbPath: string): string[] {
  return [`${dbPath}-wal`, `${dbPath}-shm`];
}
