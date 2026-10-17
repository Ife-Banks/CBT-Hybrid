import { Injectable } from '@nestjs/common';

/** Injection token for {@link SchoolSettingsRepository}. */
export const SCHOOL_SETTINGS_REPOSITORY = Symbol('SCHOOL_SETTINGS_REPOSITORY');

/**
 * Raw persistence port for the `schools.settings` jsonb column. The service
 * layers the typed contract (defaults + validation) on top; the repository only
 * reads and writes the raw object so unknown keys owned by other modules survive.
 */
export interface SchoolSettingsRepository {
  get(schoolId: string): Promise<Record<string, unknown> | null>;
  update(schoolId: string, settings: Record<string, unknown>): Promise<Record<string, unknown>>;
}

@Injectable()
export class InMemorySchoolSettingsRepository implements SchoolSettingsRepository {
  private readonly settings = new Map<string, Record<string, unknown>>();

  async get(schoolId: string): Promise<Record<string, unknown> | null> {
    const found = this.settings.get(schoolId);
    return found ? clone(found) : null;
  }

  async update(schoolId: string, settings: Record<string, unknown>): Promise<Record<string, unknown>> {
    const stored = clone(settings);
    this.settings.set(schoolId, stored);
    return clone(stored);
  }

  /** Seed settings for tests. */
  seed(schoolId: string, settings: Record<string, unknown>): void {
    this.settings.set(schoolId, clone(settings));
  }

  clear(): void {
    this.settings.clear();
  }
}

function clone(settings: Record<string, unknown>): Record<string, unknown> {
  // Settings are JSON (a jsonb column), so a JSON round-trip is a safe deep copy
  // that does not depend on the DOM/Node lib for `structuredClone`.
  return JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
}
