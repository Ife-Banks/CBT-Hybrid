import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { META_KEYS, META_REPOSITORY, type MetaRepository } from '../exam/repositories/meta.repository';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../exam/repositories/catalog.repository';
import { problem } from '../../common/http/problem';

@Injectable()
export class ConsoleService {
  private loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    @Inject(META_REPOSITORY) private readonly metaRepo: MetaRepository,
    @Inject(CATALOG_REPOSITORY) private readonly catalogRepo: CatalogRepository,
  ) {}

  async login(pin: string, label?: string) {
    const pinHash = await this.metaRepo.get(META_KEYS.consolePinHash);
    if (!pinHash) {
      throw problem('CONFLICT', 'Console PIN is not configured');
    }

    const attempts = this.loginAttempts.get('console') ?? { count: 0, lockedUntil: 0 };
    const now = Date.now();
    if (attempts.lockedUntil > now) {
      const retryAfter = Math.ceil((attempts.lockedUntil - now) / 1000);
      throw problem('CONSOLE_LOCKED', `Too many failed PIN attempts. Retry after ${retryAfter} seconds`);
    }

    const valid = await argon2.verify(pinHash, pin);
    if (!valid) {
      attempts.count += 1;
      if (attempts.count >= 5) {
        attempts.lockedUntil = now + 5 * 60 * 1000; // 5 minutes
        attempts.count = 0;
      }
      this.loginAttempts.set('console', attempts);
      throw problem('INVALID_CREDENTIALS', 'Invalid PIN');
    }

    this.loginAttempts.delete('console');
    const token = randomBytes(32).toString('base64url');
    return { token, expires_in: 28800 }; // 8 hours
  }

  async changePin(oldPin: string, newPin: string) {
    const pinHash = await this.metaRepo.get(META_KEYS.consolePinHash);
    if (!pinHash) {
      throw problem('CONFLICT', 'Console PIN is not configured');
    }

    const valid = await argon2.verify(pinHash, oldPin);
    if (!valid) {
      throw problem('INVALID_CREDENTIALS', 'Invalid current PIN');
    }

    const newHash = await argon2.hash(newPin);
    await this.metaRepo.set(META_KEYS.consolePinHash, newHash);
    return { success: true };
  }

  async resetPin(resetCode: string, newPin: string) {
    // TODO: Verify reset code from cloud (Section 12.2)
    // For now, reset code validation is skipped
    const newHash = await argon2.hash(newPin);
    await this.metaRepo.set(META_KEYS.consolePinHash, newHash);
    return { success: true };
  }

  async getOverview() {
    const [schoolName, openSittings] = await Promise.all([
      this.metaRepo.get(META_KEYS.schoolName),
      this.catalogRepo.countOpenSittings(),
    ]);

    const inProgressSessions = await this.catalogRepo.countInProgressSessions();
    const submittedSessions = await this.catalogRepo.countSubmittedSessions();

    return {
      school_name: schoolName ?? '',
      open_sittings: openSittings,
      in_progress_sessions: inProgressSessions,
      submitted_sessions: submittedSessions,
    };
  }

  async openSitting(sittingId: string) {
    await this.catalogRepo.openSitting(sittingId);
    return { success: true };
  }

  async closeSitting(sittingId: string) {
    await this.catalogRepo.closeSitting(sittingId);
    return { success: true };
  }
}
