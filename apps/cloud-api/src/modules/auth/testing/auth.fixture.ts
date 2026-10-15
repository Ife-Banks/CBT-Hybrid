import { uuidv7, type Role } from '@cbt/shared-types';
import type { PasswordResetMessage } from '../notifier';
import type { Notifier } from '../notifier';
import type { UserRecord, SchoolRef } from '../domain/types';
import type { InMemoryUserRepository } from '../repositories/user.repository';
import type { PasswordService } from '../password.service';

/**
 * Test doubles for the auth module. Excluded from the production build
 * (`tsconfig.build.json` ignores `**\/*.fixture.ts`).
 */

/** A controllable clock; override the `ClockService` provider with one. */
export class FakeClock {
  private current = new Date('2026-01-01T08:00:00.000Z');

  now(): Date {
    return new Date(this.current);
  }

  nowMs(): number {
    return this.current.getTime();
  }

  set(iso: string): void {
    this.current = new Date(iso);
  }

  reset(): void {
    this.current = new Date('2026-01-01T08:00:00.000Z');
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/** Captures one-time codes instead of sending them. */
export class CapturingNotifier implements Notifier {
  readonly messages: PasswordResetMessage[] = [];

  async sendPasswordReset(message: PasswordResetMessage): Promise<void> {
    this.messages.push(message);
  }

  lastCode(): string | undefined {
    return this.messages.at(-1)?.code;
  }

  clear(): void {
    this.messages.length = 0;
  }
}

/** Options accepted by {@link seedUser}; everything but the password is stored. */
export interface SeedUserOptions {
  id?: string;
  role?: Role;
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  schoolId?: string | null;
  school?: SchoolRef | null;
  password?: string;
  /** Pre-computed hash; when set, `password` is ignored (keeps tests fast). */
  passwordHash?: string;
  mustChangePassword?: boolean;
  status?: 'active' | 'suspended';
  totpEnabled?: boolean;
  totpSecret?: string | null;
  recoveryCodeHashes?: string[];
  failedLoginAttempts?: number;
  lockedUntil?: Date | null;
}

/**
 * Insert a user with sensible defaults. There is no registration endpoint in
 * Phase 2 (the first admin is created by invitation), so tests seed the
 * repository directly.
 */
export async function seedUser(
  users: InMemoryUserRepository,
  passwords: PasswordService,
  options: SeedUserOptions = {},
): Promise<UserRecord> {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const schoolId = options.schoolId === undefined ? 'school-1' : options.schoolId;
  const school =
    options.school === undefined
      ? schoolId
        ? { id: schoolId, code: 'GRA', name: 'Graceland College' }
        : null
      : options.school;

  const user: UserRecord = {
    id: options.id ?? uuidv7(),
    role: options.role ?? 'school_admin',
    fullName: options.fullName ?? 'Ada Okafor',
    email: options.email === undefined ? 'ada@school.ng' : options.email,
    phone: options.phone ?? null,
    schoolId,
    school,
    passwordHash:
      options.passwordHash ?? (await passwords.hash(options.password ?? 'TestPassword123!')),
    mustChangePassword: options.mustChangePassword ?? false,
    status: options.status ?? 'active',
    totpEnabled: options.totpEnabled ?? false,
    totpSecret: options.totpSecret ?? null,
    recoveryCodeHashes: options.recoveryCodeHashes ?? [],
    failedLoginAttempts: options.failedLoginAttempts ?? 0,
    lockedUntil: options.lockedUntil ?? null,
    passwordChangedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await users.create(user);
  return user;
}
