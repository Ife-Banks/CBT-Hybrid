import { BadRequestException } from '@nestjs/common';

/** Who may release results (BR-14, API spec 11.3). */
export type ReleasePolicy = 'admin_only' | 'class_teacher';

/** BR-21: paid delivery channels toggled per school. */
export interface PaidChannelsEnabled {
  sms: boolean;
  whatsapp: boolean;
}

export interface RetentionSettings {
  results_years_after_leaving: number;
  sessions_months: number;
}

export interface InviteExpirySettings {
  staff: number;
  guardian: number;
}

/** The `schools.settings` contract from API spec section 11.3. */
export interface SchoolSettings {
  release_policy: ReleasePolicy;
  require_question_approval: boolean;
  notify_on_remark: boolean;
  paid_channels_enabled: PaidChannelsEnabled;
  paid_message_monthly_cap: number;
  strict_seats: boolean;
  retention: RetentionSettings;
  invite_expiry_days: InviteExpirySettings;
  exam_key_digits: number;
}

/** A partial settings update (every key optional). */
export interface SchoolSettingsPatch {
  release_policy?: ReleasePolicy;
  require_question_approval?: boolean;
  notify_on_remark?: boolean;
  paid_channels_enabled?: Partial<PaidChannelsEnabled>;
  paid_message_monthly_cap?: number;
  strict_seats?: boolean;
  retention?: Partial<RetentionSettings>;
  invite_expiry_days?: Partial<InviteExpirySettings>;
  exam_key_digits?: number;
}

export const DEFAULT_SCHOOL_SETTINGS: SchoolSettings = {
  release_policy: 'admin_only',
  require_question_approval: false,
  notify_on_remark: true,
  paid_channels_enabled: { sms: false, whatsapp: false },
  paid_message_monthly_cap: 500,
  strict_seats: false,
  retention: { results_years_after_leaving: 2, sessions_months: 12 },
  invite_expiry_days: { staff: 7, guardian: 14 },
  exam_key_digits: 6,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readBoolean(value: unknown, fallback: boolean, key: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw invalid(key, 'must be a boolean');
  return value;
}

function readInteger(value: unknown, fallback: number, key: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw invalid(key, 'must be a non-negative integer');
  }
  return value;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T, key: string): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw invalid(key, `must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function invalid(key: string, message: string): BadRequestException {
  return new BadRequestException({
    code: 'INVALID_SETTINGS',
    message: `Invalid setting "${key}": ${message}`,
    field: key,
  });
}

/**
 * Merge a possibly-partial, possibly-unknown settings object with the defaults,
 * rejecting wrong types. Unknown keys are ignored here; the repository keeps the
 * raw object so settings owned by other modules survive a settings update.
 */
export function normalizeSchoolSettings(raw: unknown): SchoolSettings {
  const value = asRecord(raw);
  const paid = asRecord(value.paid_channels_enabled);
  const retention = asRecord(value.retention);
  const expiry = asRecord(value.invite_expiry_days);

  return {
    release_policy: readEnum(value.release_policy, ['admin_only', 'class_teacher'], 'admin_only', 'release_policy'),
    require_question_approval: readBoolean(
      value.require_question_approval,
      DEFAULT_SCHOOL_SETTINGS.require_question_approval,
      'require_question_approval',
    ),
    notify_on_remark: readBoolean(
      value.notify_on_remark,
      DEFAULT_SCHOOL_SETTINGS.notify_on_remark,
      'notify_on_remark',
    ),
    paid_channels_enabled: {
      sms: readBoolean(paid.sms, false, 'paid_channels_enabled.sms'),
      whatsapp: readBoolean(paid.whatsapp, false, 'paid_channels_enabled.whatsapp'),
    },
    paid_message_monthly_cap: readInteger(
      value.paid_message_monthly_cap,
      DEFAULT_SCHOOL_SETTINGS.paid_message_monthly_cap,
      'paid_message_monthly_cap',
    ),
    strict_seats: readBoolean(value.strict_seats, DEFAULT_SCHOOL_SETTINGS.strict_seats, 'strict_seats'),
    retention: {
      results_years_after_leaving: readInteger(
        retention.results_years_after_leaving,
        DEFAULT_SCHOOL_SETTINGS.retention.results_years_after_leaving,
        'retention.results_years_after_leaving',
      ),
      sessions_months: readInteger(
        retention.sessions_months,
        DEFAULT_SCHOOL_SETTINGS.retention.sessions_months,
        'retention.sessions_months',
      ),
    },
    invite_expiry_days: {
      staff: readInteger(expiry.staff, DEFAULT_SCHOOL_SETTINGS.invite_expiry_days.staff, 'invite_expiry_days.staff'),
      guardian: readInteger(
        expiry.guardian,
        DEFAULT_SCHOOL_SETTINGS.invite_expiry_days.guardian,
        'invite_expiry_days.guardian',
      ),
    },
    exam_key_digits: readInteger(value.exam_key_digits, DEFAULT_SCHOOL_SETTINGS.exam_key_digits, 'exam_key_digits'),
  };
}
