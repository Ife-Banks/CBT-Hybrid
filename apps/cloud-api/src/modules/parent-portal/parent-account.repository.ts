import { Injectable } from '@nestjs/common';
import type { NotificationPreferences } from '../results/domain/types';

/** Injection token for {@link ParentAccountRepository}. */
export const PARENT_ACCOUNT_REPOSITORY = Symbol('PARENT_ACCOUNT_REPOSITORY');

export interface GuardianProfile {
  id: string;
  schoolId: string;
  userId: string | null;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  notificationPrefs: NotificationPreferences;
}

/** Read/write port for the parts of a guardian the parent portal manages. */
export interface ParentAccountRepository {
  findById(guardianId: string): Promise<GuardianProfile | null>;
  findByUserId(userId: string): Promise<GuardianProfile | null>;
  updateNotificationPrefs(guardianId: string, prefs: NotificationPreferences): Promise<void>;
  updateEmail(guardianId: string, email: string): Promise<void>;
}

@Injectable()
export class InMemoryParentAccountRepository implements ParentAccountRepository {
  private readonly guardians = new Map<string, GuardianProfile>();

  seed(profile: GuardianProfile): void {
    this.guardians.set(profile.id, clone(profile));
  }

  async findById(guardianId: string): Promise<GuardianProfile | null> {
    const found = this.guardians.get(guardianId);
    return found ? clone(found) : null;
  }

  async findByUserId(userId: string): Promise<GuardianProfile | null> {
    for (const guardian of this.guardians.values()) {
      if (guardian.userId === userId) return clone(guardian);
    }
    return null;
  }

  async updateNotificationPrefs(guardianId: string, prefs: NotificationPreferences): Promise<void> {
    const existing = this.guardians.get(guardianId);
    if (!existing) throw new Error(`guardian ${guardianId} not found`);
    this.guardians.set(guardianId, { ...existing, notificationPrefs: { ...prefs } });
  }

  async updateEmail(guardianId: string, email: string): Promise<void> {
    const existing = this.guardians.get(guardianId);
    if (!existing) throw new Error(`guardian ${guardianId} not found`);
    this.guardians.set(guardianId, { ...existing, email });
  }

  clear(): void {
    this.guardians.clear();
  }
}

function clone(profile: GuardianProfile): GuardianProfile {
  return { ...profile, notificationPrefs: { ...profile.notificationPrefs } };
}
