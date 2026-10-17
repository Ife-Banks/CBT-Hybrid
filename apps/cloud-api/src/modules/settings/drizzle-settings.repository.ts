import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { schools } from '@cbt/shared-types';
import { DrizzleService, type DrizzleDB } from '../../shared/database/drizzle.service';
import type { SchoolSettingsRepository } from './settings.repository';

/**
 * Drizzle-backed settings store: reads and updates `schools.settings`. A settings
 * update for an unknown school row is treated as a missing resource.
 */
@Injectable()
export class DrizzleSchoolSettingsRepository implements SchoolSettingsRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async get(schoolId: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.db
      .select({ settings: schools.settings })
      .from(schools)
      .where(eq(schools.id, schoolId))
      .limit(1);
    if (!row) return null;
    return (row.settings as Record<string, unknown> | null) ?? {};
  }

  async update(schoolId: string, settings: Record<string, unknown>): Promise<Record<string, unknown>> {
    const rows = await this.db
      .update(schools)
      .set({ settings, updatedAt: new Date() })
      .where(eq(schools.id, schoolId))
      .returning({ settings: schools.settings });
    const row = rows[0];
    if (!row) throw new Error(`school ${schoolId} not found`);
    return (row.settings as Record<string, unknown> | null) ?? {};
  }
}
