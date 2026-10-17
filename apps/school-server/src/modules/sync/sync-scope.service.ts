import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  META_KEYS,
  META_REPOSITORY,
  type MetaRepository,
} from '../exam/repositories/meta.repository';
import {
  SYNC_STATE_REPOSITORY,
  type SyncStateRepository,
} from './repositories/sync-state.repository';

/** School id used when `meta.school_id` has not been provisioned yet. */
export const DEFAULT_SCHOOL_ID = 'local';

const SCOPE_PREFIX = 'school';

/**
 * Cross-school sync isolation (Phase 8, task 10).
 *
 * Every piece of sync bookkeeping is namespaced by the school id this server
 * was provisioned for. Two servers – or a server re-pointed at a different
 * school – can therefore share a database without one school's cursors or
 * versions ever being mistaken for the other's.
 *
 * Reads fall back to the unscoped legacy key so an upgrade keeps its cursors;
 * writes always use the scoped key.
 */
@Injectable()
export class SyncScopeService {
  private readonly logger = new Logger(SyncScopeService.name);
  private cachedSchoolId: string | null = null;

  constructor(
    @Inject(META_REPOSITORY) private readonly metaRepo: MetaRepository,
    @Inject(SYNC_STATE_REPOSITORY) private readonly syncStateRepo: SyncStateRepository,
  ) {}

  /** The school this server belongs to, from `meta.school_id`. */
  async getSchoolId(): Promise<string> {
    if (this.cachedSchoolId) return this.cachedSchoolId;
    const value = await this.metaRepo.get(META_KEYS.schoolId);
    this.cachedSchoolId = value && value.length > 0 ? value : DEFAULT_SCHOOL_ID;
    return this.cachedSchoolId;
  }

  /** The namespaced key for a base key (`roster_cursor` → `school:X:roster_cursor`). */
  scopeKey(base: string, schoolId: string): string {
    return `${SCOPE_PREFIX}:${schoolId}:${base}`;
  }

  /** Read a scoped sync-state value, falling back to the legacy unscoped key. */
  async getState(base: string): Promise<string | null> {
    const schoolId = await this.getSchoolId();
    const scoped = await this.syncStateRepo.get(this.scopeKey(base, schoolId));
    if (scoped !== null) return scoped;

    // Upgrade path: a value written before scoping existed.
    const legacy = await this.syncStateRepo.get(base);
    if (legacy !== null) {
      this.logger.debug(`Migrating legacy sync-state key '${base}' into school scope`);
      await this.syncStateRepo.set(this.scopeKey(base, schoolId), legacy);
    }
    return legacy;
  }

  /** Write a scoped sync-state value. */
  async setState(base: string, value: string): Promise<void> {
    const schoolId = await this.getSchoolId();
    await this.syncStateRepo.set(this.scopeKey(base, schoolId), value);
  }

  /**
   * Re-check the provisioned school id. If it changed since `previousSchoolId`,
   * the caller must reset cursors: this server now belongs to a different
   * school and must not resume another school's sync. Returns the new id, or
   * null when it is unchanged.
   */
  async detectSchoolChange(previousSchoolId: string): Promise<string | null> {
    const current = await this.getSchoolId();
    if (current === previousSchoolId) return null;
    this.logger.warn(
      `School id changed from '${previousSchoolId}' to '${current}'; sync cursors will be reset`,
    );
    return current;
  }

  /** Forget the cached school id (used when provisioning changes at runtime). */
  clearCache(): void {
    this.cachedSchoolId = null;
  }
}
