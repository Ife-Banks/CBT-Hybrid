/** Injection token for the school metadata store. */
export const META_REPOSITORY = Symbol('META_REPOSITORY');

/** Keys used in the `meta` table (CBT-Database-Architecture section 4.2). */
export const META_KEYS = {
  schoolId: 'school_id',
  schoolName: 'school_name',
  deviceId: 'device_id',
  deviceKeyId: 'device_key_id',
  cloudPublicKey: 'cloud_public_key',
  schemaVersion: 'schema_version',
  consolePinHash: 'console_pin_hash',
  // First-run setup (CBT-04 section 6.3 step 8).
  cloudUrl: 'cloud_url',
  secondBackupPath: 'second_backup_path',
  setupCompletedAt: 'setup_completed_at',
  syncIntervalSeconds: 'sync_interval_seconds',
  initialCursor: 'initial_cursor',
  // In-app update (CBT-04 section 6.4).
  updateOffer: 'update_offer',
  updateCheckedAt: 'update_checked_at',
  updateCheckError: 'update_check_error',
  updateStaged: 'update_staged',
} as const;

/** Prefix for the per-pack data key, stored base64 (`pack_key:<pack_id>`). */
export const PACK_KEY_PREFIX = 'pack_key:';

/** Key/value access to device identity and school metadata. */
export interface MetaRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
