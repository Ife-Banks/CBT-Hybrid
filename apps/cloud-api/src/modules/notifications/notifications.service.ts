import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { GuardianInfo, NotificationChannel, NotificationRecord } from '../results/domain/types';
import {
  NOTIFICATION_REPOSITORY,
  type CreateNotificationInput,
  type NotificationFilter,
  type NotificationRepository,
} from './repositories/notification.repository';

/** Parent notification preferences (US-12.6). */
export interface NotificationPreferences {
  email?: boolean;
  sms?: boolean;
  whatsapp?: boolean;
  inApp?: boolean;
}

export interface NotificationUsage {
  paidMessages: number;
  cap: number;
}

const DEFAULT_CAP = 500;

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
    return this.repository.create({
      schoolId: params.schoolId,
      guardianId: params.guardian.id,
      userId: params.guardian.userId,
      studentId: params.studentId,
      resultId: params.resultId ?? null,
      channel: chooseChannel(params.guardian, params.prefs),
      template: 'results_released',
      payload: { student_id: params.studentId },
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
    return this.repository.create({
      schoolId: params.schoolId,
      guardianId: params.guardian.id,
      userId: params.guardian.userId,
      studentId: params.studentId,
      resultId: params.resultId,
      channel: chooseChannel(params.guardian, params.prefs),
      template: 'result_updated',
      payload: { student_id: params.studentId, result_id: params.resultId },
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

  async usage(schoolId: string, cap = DEFAULT_CAP, now = new Date()): Promise<NotificationUsage> {
    const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const paidMessages = await this.repository.countPaidSince(schoolId, firstOfMonth);
    return { paidMessages, cap };
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

  /** Simulated delivery sweep: every queued message becomes sent. */
  async dispatchQueued(schoolId: string): Promise<number> {
    const queued = await this.repository.list({ schoolId, status: 'queued' });
    for (const notification of queued) {
      await this.repository.update(notification.id, { status: 'sent', sentAt: new Date() });
    }
    return queued.length;
  }
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
