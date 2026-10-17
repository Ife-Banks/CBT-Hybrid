import { Injectable } from '@nestjs/common';
import type {
  NotificationChannel,
  NotificationRecord,
  NotificationStatus,
} from '../../results/domain/types';

/** Injection token for {@link NotificationRepository}. */
export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

export interface CreateNotificationInput {
  id?: string;
  schoolId: string;
  userId?: string | null;
  guardianId?: string | null;
  studentId?: string | null;
  resultId?: string | null;
  channel: NotificationChannel;
  template: string;
  payload?: Record<string, unknown> | null;
  status?: NotificationStatus;
}

export interface NotificationFilter {
  schoolId: string;
  userId?: string;
  guardianId?: string;
  status?: NotificationStatus;
  channel?: NotificationChannel;
  from?: Date;
  to?: Date;
}

export interface NotificationRepository {
  create(input: CreateNotificationInput): Promise<NotificationRecord>;
  findById(id: string): Promise<NotificationRecord | null>;
  update(
    id: string,
    patch: Partial<Omit<NotificationRecord, 'id' | 'schoolId' | 'createdAt'>>,
  ): Promise<NotificationRecord>;
  list(filter: NotificationFilter): Promise<NotificationRecord[]>;
  /** Count of paid-channel messages created since `since` (US-13.3). */
  countPaidSince(schoolId: string, since: Date): Promise<number>;
}

@Injectable()
export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly notifications = new Map<string, NotificationRecord>();
  private counter = 0;

  async create(input: CreateNotificationInput): Promise<NotificationRecord> {
    this.counter += 1;
    const record: NotificationRecord = {
      id: input.id ?? `notif-${this.counter}`,
      schoolId: input.schoolId,
      userId: input.userId ?? null,
      guardianId: input.guardianId ?? null,
      studentId: input.studentId ?? null,
      resultId: input.resultId ?? null,
      channel: input.channel,
      template: input.template,
      payload: input.payload ?? null,
      status: input.status ?? 'queued',
      attempts: 0,
      error: null,
      sentAt: null,
      readAt: null,
      createdAt: new Date(),
    };
    this.notifications.set(record.id, record);
    return clone(record);
  }

  async findById(id: string): Promise<NotificationRecord | null> {
    const found = this.notifications.get(id);
    return found ? clone(found) : null;
  }

  async update(
    id: string,
    patch: Partial<Omit<NotificationRecord, 'id' | 'schoolId' | 'createdAt'>>,
  ): Promise<NotificationRecord> {
    const existing = this.notifications.get(id);
    if (!existing) throw new Error(`notification ${id} not found`);
    const updated: NotificationRecord = { ...existing, ...patch };
    this.notifications.set(id, updated);
    return clone(updated);
  }

  async list(filter: NotificationFilter): Promise<NotificationRecord[]> {
    return [...this.notifications.values()]
      .filter((record) => record.schoolId === filter.schoolId)
      .filter((record) => !filter.userId || record.userId === filter.userId)
      .filter((record) => !filter.guardianId || record.guardianId === filter.guardianId)
      .filter((record) => !filter.status || record.status === filter.status)
      .filter((record) => !filter.channel || record.channel === filter.channel)
      .filter((record) => !filter.from || record.createdAt >= filter.from)
      .filter((record) => !filter.to || record.createdAt <= filter.to)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(clone);
  }

  async countPaidSince(schoolId: string, since: Date): Promise<number> {
    let count = 0;
    for (const record of this.notifications.values()) {
      if (record.schoolId !== schoolId) continue;
      if (record.createdAt < since) continue;
      if (record.channel === 'sms' || record.channel === 'whatsapp') count += 1;
    }
    return count;
  }

  clear(): void {
    this.notifications.clear();
    this.counter = 0;
  }
}

function clone(record: NotificationRecord): NotificationRecord {
  return { ...record, payload: record.payload ? { ...record.payload } : null };
}
