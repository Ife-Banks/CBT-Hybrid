import { Injectable } from '@nestjs/common';
import { eq, and, or } from 'drizzle-orm';
import { DrizzleService } from '../../../shared/database/drizzle.service';
import { users, schools } from '@cbt/shared-types';
import type { UserRecord } from '../domain/types';
import { toUserRecord } from '../domain/mappers';
import { USER_REPOSITORY, UserRepository } from './user.repository';

/**
 * Drizzle-backed implementation of UserRepository.
 * Replaces InMemoryUserRepository when database is configured.
 */
@Injectable()
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async findById(id: string): Promise<UserRecord | null> {
    const db = this.drizzle.getDb();
    const rows = await db
      .select({
        user: users,
        school: schools,
      })
      .from(users)
      .leftJoin(schools, eq(users.schoolId, schools.id))
      .where(eq(users.id, id))
      .limit(1);
    const row = rows[0];
    return row ? toUserRecord(row.user, row.school) : null;
  }

  async findByIdentifier(identifier: string): Promise<UserRecord | null> {
    const db = this.drizzle.getDb();
    const rows = await db
      .select({
        user: users,
        school: schools,
      })
      .from(users)
      .leftJoin(schools, eq(users.schoolId, schools.id))
      .where(or(eq(users.email, identifier), eq(users.phoneE164, identifier)))
      .limit(1);
    const row = rows[0];
    return row ? toUserRecord(row.user, row.school) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const db = this.drizzle.getDb();
    const rows = await db
      .select({
        user: users,
        school: schools,
      })
      .from(users)
      .leftJoin(schools, eq(users.schoolId, schools.id))
      .where(eq(users.email, email))
      .limit(1);
    const row = rows[0];
    return row ? toUserRecord(row.user, row.school) : null;
  }

  async findByPhone(phone: string): Promise<UserRecord | null> {
    const db = this.drizzle.getDb();
    const rows = await db
      .select({
        user: users,
        school: schools,
      })
      .from(users)
      .leftJoin(schools, eq(users.schoolId, schools.id))
      .where(eq(users.phoneE164, phone))
      .limit(1);
    const row = rows[0];
    return row ? toUserRecord(row.user, row.school) : null;
  }

  async save(user: UserRecord): Promise<void> {
    const db = this.drizzle.getDb();
    await db
      .update(users)
      .set({
        passwordHash: user.passwordHash,
        status: user.status === 'suspended' ? 'suspended' : 'active',
        totpSecret: user.totpSecret,
        recoveryCodeHashes: user.recoveryCodeHashes,
        failedLoginAttempts: user.failedLoginAttempts,
        lockedUntil: user.lockedUntil,
        lastLoginAt: user.lastLoginAt,
        mustChangePassword: user.mustChangePassword,
        passwordChangedAt: user.passwordChangedAt,
        preferences: user.preferences as any,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  }

  async create(user: UserRecord): Promise<void> {
    const db = this.drizzle.getDb();
    await db.insert(users).values({
      id: user.id,
      schoolId: user.schoolId,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
      phoneE164: user.phone,
      passwordHash: user.passwordHash,
      status: user.status === 'suspended' ? 'suspended' : 'active',
      totpSecret: user.totpSecret,
      recoveryCodeHashes: user.recoveryCodeHashes,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
      lastLoginAt: user.lastLoginAt,
      mustChangePassword: user.mustChangePassword,
      passwordChangedAt: user.passwordChangedAt,
      preferences: user.preferences as any,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  async listBySchool(schoolId: string): Promise<UserRecord[]> {
    const db = this.drizzle.getDb();
    const rows = await db
      .select({
        user: users,
        school: schools,
      })
      .from(users)
      .leftJoin(schools, eq(users.schoolId, schools.id))
      .where(eq(users.schoolId, schoolId));
    return rows.map((row) => toUserRecord(row.user, row.school));
  }
}
