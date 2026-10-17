import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { guardians } from '@cbt/shared-types';
import { DrizzleService, type DrizzleDB } from '../../shared/database/drizzle.service';
import type { NotificationPreferences } from '../results/domain/types';
import type { GuardianProfile, ParentAccountRepository } from './parent-account.repository';

function prefsOf(value: unknown): NotificationPreferences {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as NotificationPreferences)
    : {};
}

/** Drizzle-backed parent account store over the `guardians` table. */
@Injectable()
export class DrizzleParentAccountRepository implements ParentAccountRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async findById(guardianId: string): Promise<GuardianProfile | null> {
    const [row] = await this.db.select().from(guardians).where(eq(guardians.id, guardianId)).limit(1);
    return row ? this.map(row) : null;
  }

  async findByUserId(userId: string): Promise<GuardianProfile | null> {
    const [row] = await this.db.select().from(guardians).where(eq(guardians.userId, userId)).limit(1);
    return row ? this.map(row) : null;
  }

  async updateNotificationPrefs(guardianId: string, prefs: NotificationPreferences): Promise<void> {
    await this.db
      .update(guardians)
      .set({ notificationPrefs: prefs, updatedAt: new Date() })
      .where(eq(guardians.id, guardianId));
  }

  async updateEmail(guardianId: string, email: string): Promise<void> {
    await this.db
      .update(guardians)
      .set({ email, updatedAt: new Date() })
      .where(eq(guardians.id, guardianId));
  }

  private map(row: {
    id: string;
    schoolId: string;
    userId: string | null;
    fullName: string;
    email: string | null;
    phoneE164: string | null;
    notificationPrefs: unknown;
  }): GuardianProfile {
    return {
      id: row.id,
      schoolId: row.schoolId,
      userId: row.userId,
      fullName: row.fullName,
      email: row.email,
      phoneE164: row.phoneE164,
      notificationPrefs: prefsOf(row.notificationPrefs),
    };
  }
}
