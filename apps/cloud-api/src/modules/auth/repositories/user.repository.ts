import { Injectable } from '@nestjs/common';
import { normalisePhone } from '@cbt/exam-core';
import type { UserRecord } from '../domain/types';

/** Injection token for {@link UserRepository}. */
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/**
 * Persistence port for users. Phase 2 ships an in-memory implementation; the
 * Drizzle implementation replaces it in Phase 3 without changing callers.
 */
export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  /** Look up by email (case-insensitive) or phone (E.164). */
  findByIdentifier(identifier: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findByPhone(phone: string): Promise<UserRecord | null>;
  create(user: UserRecord): Promise<void>;
  save(user: UserRecord): Promise<void>;
  listBySchool(schoolId: string): Promise<UserRecord[]>;
}

/** Normalise an identifier to an email (lower-cased) or E.164 phone. */
export function normaliseIdentifier(identifier: string): { email: string } | { phone: string } {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) {
    return { email: trimmed.toLowerCase() };
  }
  // `normalisePhone` accepts local (NG) and international forms. An invalid
  // number is returned as-is so the lookup simply finds nothing.
  return { phone: normalisePhone(trimmed) ?? trimmed };
}

@Injectable()
export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, UserRecord>();

  async findById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async findByIdentifier(identifier: string): Promise<UserRecord | null> {
    const normalised = normaliseIdentifier(identifier);
    if ('email' in normalised) return this.findByEmail(normalised.email);
    return this.findByPhone(normalised.phone);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const wanted = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email && user.email.toLowerCase() === wanted) return user;
    }
    return null;
  }

  async findByPhone(phone: string): Promise<UserRecord | null> {
    for (const user of this.users.values()) {
      if (user.phone && user.phone === phone) return user;
    }
    return null;
  }

  async create(user: UserRecord): Promise<void> {
    if (this.users.has(user.id)) {
      throw new Error(`user ${user.id} already exists`);
    }
    this.users.set(user.id, cloneUser(user));
  }

  async save(user: UserRecord): Promise<void> {
    this.users.set(user.id, cloneUser(user));
  }

  async listBySchool(schoolId: string): Promise<UserRecord[]> {
    return [...this.users.values()].filter((user) => user.schoolId === schoolId).map(cloneUser);
  }

  /** Drop every user. Test and local-development helper. */
  clear(): void {
    this.users.clear();
  }
}

/** Defensive copy so callers cannot mutate stored state by reference. */
function cloneUser(user: UserRecord): UserRecord {
  return {
    ...user,
    school: user.school ? { ...user.school } : null,
    recoveryCodeHashes: [...user.recoveryCodeHashes],
    lockedUntil: user.lockedUntil ? new Date(user.lockedUntil) : null,
    passwordChangedAt: user.passwordChangedAt ? new Date(user.passwordChangedAt) : null,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}
