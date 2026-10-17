import { Inject, Injectable } from '@nestjs/common';
import {
  normalizeSchoolSettings,
  type SchoolSettings,
  type SchoolSettingsPatch,
} from './settings.types';
import {
  SCHOOL_SETTINGS_REPOSITORY,
  type SchoolSettingsRepository,
} from './settings.repository';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Typed view over `schools.settings` (API spec 11.3). Missing keys fall back to
 * the documented defaults, so every module can read a setting without worrying
 * about a school that has never saved settings.
 */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(SCHOOL_SETTINGS_REPOSITORY) private readonly repository: SchoolSettingsRepository,
  ) {}

  async get(schoolId: string): Promise<SchoolSettings> {
    const raw = (await this.repository.get(schoolId)) ?? {};
    return normalizeSchoolSettings(raw);
  }

  /**
   * Merge a patch over the stored settings. Nested objects (`paid_channels_enabled`,
   * `retention`, `invite_expiry_days`) merge key-by-key rather than replacing the
   * whole object, so a partial PATCH from the UI never drops sibling keys.
   */
  async update(schoolId: string, patch: SchoolSettingsPatch): Promise<SchoolSettings> {
    const raw = (await this.repository.get(schoolId)) ?? {};
    const merged: Record<string, unknown> = {
      ...raw,
      ...patch,
      paid_channels_enabled: { ...asRecord(raw.paid_channels_enabled), ...(patch.paid_channels_enabled ?? {}) },
      retention: { ...asRecord(raw.retention), ...(patch.retention ?? {}) },
      invite_expiry_days: { ...asRecord(raw.invite_expiry_days), ...(patch.invite_expiry_days ?? {}) },
    };
    const settings = normalizeSchoolSettings(merged);
    await this.repository.update(schoolId, { ...raw, ...settings });
    return settings;
  }
}
