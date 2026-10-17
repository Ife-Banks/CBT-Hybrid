import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { GuardianInfo, NotificationChannel, NotificationRecord } from '../results/domain/types';
import type { NotificationPreferences } from '../results/domain/types';
import { SettingsService } from '../settings/settings.service';
import { DEFAULT_SCHOOL_SETTINGS, type SchoolSettings } from '../settings/settings.types';
import {
  NOTIFICATION_REPOSITORY,
  type CreateNotificationInput,
  type NotificationFilter,
  type NotificationRepository,
} from './repositories/notification.repository';

export type { NotificationPreferences } from '../results/domain/types';

export interface NotificationUsage {
  paidMessages: number;
  cap: number;
}

/**
 * Notification queue (API spec 11.2). Templates never contain a score; the
 * release flow only tells a guardian "results are available". Actual delivery
 * is simulated here (queued -> sent) since the transport lands in the
 * production phase.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  async enqueue(input: CreateNotificationInput): Promise<NotificationRecord> {
    return this.repository.create(input);
  }

  /** Queue a "results released" notification (no score) for one guardian. */
  async queueResultsReleased(params: {
    schoolId: string;
    guardian: GuardianInfo;
    studentId: string;
    resultId?: string;
    prefs?: NotificationPreferences;
  }): Promise<NotificationRecord> {
    const resolved = await this.resolveChannel(params.schoolId, params.guardian, params.prefs);
    return this.repository.create({
      schoolId: params.schoolId,
      guardianId: params.guardian.id,
      userId: params.guardian.userId,
      studentId: params.studentId,
      resultId: params.resultId ?? null,
      channel: resolved.channel,
      template: 'results_released',
      payload: {
        student_id: params.studentId,
        ...(resolved.downgradedFrom ? { downgraded_from: resolved.downgradedFrom } : {}),
      },
    });
  }

  /** Queue a "a released score changed" notification for one guardian (BR-15). */
  async queueResultUpdated(params: {
    schoolId: string;
    guardian: GuardianInfo;
    studentId: string;
    resultId: string;
    prefs?: NotificationPreferences;
  }): Promise<NotificationRecord> {
    const resolved = await this.resolveChannel(params.schoolId, params.guardian, params.prefs);
    return this.repository.create({
      schoolId: params.schoolId,
      guardianId: params.guardian.id,
      userId: params.guardian.userId,
      studentId: params.studentId,
      resultId: params.resultId,
      channel: resolved.channel,
      template: 'result_updated',
      payload: {
        student_id: params.studentId,
        result_id: params.resultId,
        ...(resolved.downgradedFrom ? { downgraded_from: resolved.downgradedFrom } : {}),
      },
    });
  }

  async listLog(schoolId: string, filter: Partial<NotificationFilter> = {}): Promise<NotificationRecord[]> {
    return this.repository.list({ schoolId, ...filter });
  }

  async retry(schoolId: string, id: string): Promise<NotificationRecord> {
    const existing = await this.repository.findById(id);
    if (!existing || existing.schoolId !== schoolId) {
      throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found' });
    }
    return this.repository.update(id, { status: 'queued', error: null });
  }

  async usage(schoolId: string, cap?: number, now = new Date()): Promise<NotificationUsage> {
    const limit = cap ?? (await this.schoolSettings(schoolId)).paid_message_monthly_cap;
    const paidMessages = await this.repository.countPaidSince(schoolId, startOfMonth(now));
    return { paidMessages, cap: limit };
  }

  async listForGuardian(schoolId: string, guardianId: string): Promise<NotificationRecord[]> {
    return this.repository.list({ schoolId, guardianId });
  }

  async listForUser(schoolId: string, userId: string): Promise<NotificationRecord[]> {
    return this.repository.list({ schoolId, userId });
  }

  async markRead(id: string, at = new Date()): Promise<NotificationRecord> {
    await this.repository.findById(id);
    return this.repository.update(id, { readAt: at });
  }

  /**
   * Mark one of the guardian's own notifications read. A notification that does
   * not belong to this guardian (or this school) is a `404`, never a `403`.
   */
  async markReadForGuardian(
    schoolId: string,
    guardianId: string,
    id: string,
    at = new Date(),
  ): Promise<NotificationRecord> {
    const existing = await this.repository.findById(id);
    if (!existing || existing.schoolId !== schoolId || existing.guardianId !== guardianId) {
      throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found' });
    }
    return this.repository.update(id, { readAt: at });
  }

  /** Simulated delivery sweep: every queued message becomes sent. */
  async dispatchQueued(schoolId: string): Promise<number> {
    const queued = await this.repository.list({ schoolId, status: 'queued' });
    for (const notification of queued) {
      await this.repository.update(notification.id, { status: 'sent', sentAt: new Date() });
    }
    return queued.length;
  }

  private async schoolSettings(schoolId: string): Promise<SchoolSettings> {
    return this.settings ? this.settings.get(schoolId) : DEFAULT_SCHOOL_SETTINGS;
  }

  /**
   * BR-21: gate paid channels. A disabled paid channel, or a school over its
   * monthly cap, silently downgrades to email (or in-app) and records the
   * original channel so the delivery log shows why.
   */
  private async resolveChannel(
    schoolId: string,
    guardian: GuardianInfo,
    prefs?: NotificationPreferences,
  ): Promise<{ channel: NotificationChannel; downgradedFrom?: NotificationChannel }> {
    const preferred = chooseChannel(guardian, prefs);
    if (preferred !== 'sms' && preferred !== 'whatsapp') return { channel: preferred };

    const settings = await this.schoolSettings(schoolId);
    const enabled =
      preferred === 'sms' ? settings.paid_channels_enabled.sms : settings.paid_channels_enabled.whatsapp;
    if (!enabled) return { channel: fallbackChannel(guardian), downgradedFrom: preferred };

    const used = await this.repository.countPaidSince(schoolId, startOfMonth(new Date()));
    if (used >= settings.paid_message_monthly_cap) {
      return { channel: fallbackChannel(guardian), downgradedFrom: preferred };
    }
    return { channel: preferred };
  }
}

function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** The free channel to fall back to when a paid channel is unavailable. */
function fallbackChannel(guardian: GuardianInfo): NotificationChannel {
  return guardian.email ? 'email' : 'in_app';
}

/**
 * BR-21: pick a channel from the guardian's contact details, honouring the
 * parent's preferences when provided. Falls back to an in-app message.
 */
export function chooseChannel(
  guardian: GuardianInfo,
  prefs?: NotificationPreferences,
): NotificationChannel {
  const hasEmail = Boolean(guardian.email);
  const hasPhone = Boolean(guardian.phoneE164);

  if (prefs) {
    if (prefs.email && hasEmail) return 'email';
    if (prefs.whatsapp && hasPhone) return 'whatsapp';
    if (prefs.sms && hasPhone) return 'sms';
    if (prefs.inApp) return 'in_app';
  }
  if (hasEmail) return 'email';
  if (hasPhone) return 'sms';
  return 'in_app';
}
