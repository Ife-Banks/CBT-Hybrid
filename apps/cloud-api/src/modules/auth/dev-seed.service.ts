import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { uuidv7, type Role } from '@cbt/shared-types';
import { normalisePhone } from '@cbt/exam-core';
import { ConfigService } from '../../common/config/config.service';
import { LoggerService } from '../../shared/logger/logger.service';
import { PasswordService } from './password.service';
import { USER_REPOSITORY, type UserRepository } from './repositories/user.repository';
import type { UserRecord } from './domain/types';

/** One account in the `AUTH_DEV_SEED` JSON array. */
interface SeedEntry {
  email?: string;
  phone?: string;
  password: string;
  role: Role;
  fullName?: string;
  schoolId?: string;
  schoolCode?: string;
  schoolName?: string;
  mustChangePassword?: boolean;
  status?: 'active' | 'suspended';
}

/**
 * Inserts development accounts at startup from the `AUTH_DEV_SEED` environment
 * variable (a JSON array). There is no registration endpoint in Phase 2 and the
 * user store is in memory, so this is how a local instance gets its first
 * sign-in until the data layer seeds real schools (Phase 3).
 *
 * Never runs in production. Duplicate email/phone entries are skipped, so it is
 * safe to leave the variable set while the dev server restarts.
 */
@Injectable()
export class DevSeedService implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
    private readonly passwords: PasswordService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    const raw = this.config.devSeedUsers;
    if (!raw || this.config.isProduction) return;

    const entries = this.parse(raw);
    let created = 0;

    for (const entry of entries) {
      const email = entry.email ? entry.email.trim().toLowerCase() : null;
      const phone = entry.phone ? (normalisePhone(entry.phone) ?? entry.phone) : null;

      if (email && (await this.users.findByEmail(email))) continue;
      if (phone && (await this.users.findByPhone(phone))) continue;

      const schoolId = entry.schoolId ?? (entry.role === 'platform_owner' ? null : 'school-1');
      const now = new Date();

      await this.users.create({
        id: uuidv7(),
        role: entry.role,
        fullName: entry.fullName ?? email ?? phone ?? entry.role,
        email,
        phone,
        schoolId,
        school: schoolId
          ? {
              id: schoolId,
              code: entry.schoolCode ?? 'DEV',
              name: entry.schoolName ?? 'Development School',
            }
          : null,
        passwordHash: await this.passwords.hash(entry.password),
        mustChangePassword: entry.mustChangePassword ?? false,
        status: entry.status ?? 'active',
        totpEnabled: false,
        totpSecret: null,
        recoveryCodeHashes: [],
        failedLoginAttempts: 0,
        lockedUntil: null,
        passwordChangedAt: null,
        createdAt: now,
        updatedAt: now,
      } satisfies UserRecord);

      created += 1;
    }

    this.logger.log(`seeded ${created} development account(s)`, 'DevSeed');
  }

  /** Parse and validate the JSON array; throw with a clear message otherwise. */
  private parse(raw: string): SeedEntry[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('AUTH_DEV_SEED must be a JSON array of seed entries');
    }

    if (!Array.isArray(parsed)) {
      throw new Error('AUTH_DEV_SEED must be a JSON array of seed entries');
    }

    for (const entry of parsed as SeedEntry[]) {
      if (!entry || typeof entry !== 'object' || !entry.role || !entry.password) {
        throw new Error('Each AUTH_DEV_SEED entry needs a "role" and a "password"');
      }
      if (!entry.email && !entry.phone) {
        throw new Error('Each AUTH_DEV_SEED entry needs an "email" or a "phone"');
      }
      const problems = this.passwords.validate(entry.password, {
        email: entry.email ?? null,
        phone: entry.phone ?? null,
      });
      if (problems.length > 0) {
        throw new Error(
          `AUTH_DEV_SEED password for ${entry.email ?? entry.phone} is invalid: ${problems
            .map((problem) => problem.code)
            .join(', ')}`,
        );
      }
    }

    return parsed as SeedEntry[];
  }
}
