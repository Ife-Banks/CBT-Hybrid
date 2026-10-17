import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { notifications } from '@cbt/shared-types';
import { DrizzleService, type DrizzleDB } from '../../../shared/database/drizzle.service';
import { mapNotificationFromDb } from '../../results/domain/mappers';
import type { NotificationRecord } from '../../results/domain/types';
import type {
  CreateNotificationInput,
  NotificationFilter,
  NotificationRepository,
} from './notification.repository';

@Injectable()
export class DrizzleNotificationRepository implements NotificationRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async create(input: CreateNotificationInput): Promise<NotificationRecord> {
    const rows = await this.db
      .insert(notifications)
      .values({
        ...(input.id ? { id: input.id } : {}),
        schoolId: input.schoolId,
        userId: input.userId ?? null,
        guardianId: input.guardianId ?? null,
        studentId: input.studentId ?? null,
        resultId: input.resultId ?? null,
        channel: input.channel,
        template: input.template,
        payload: input.payload ?? null,
        status: input.status ?? 'queued',
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Failed to create notification');
    return mapNotificationFromDb(row);
  }

  async findById(id: string): Promise<NotificationRecord | null> {
    const [row] = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id))
      .limit(1);
    return row ? mapNotificationFromDb(row) : null;
  }

  async update(
    id: string,
    patch: Partial<Omit<NotificationRecord, 'id' | 'schoolId' | 'createdAt'>>,
  ): Promise<NotificationRecord> {
    const rows = await this.db
      .update(notifications)
      .set({
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.attempts !== undefined && { attempts: patch.attempts }),
        ...(patch.error !== undefined && { error: patch.error }),
        ...(patch.sentAt !== undefined && { sentAt: patch.sentAt }),
        ...(patch.readAt !== undefined && { readAt: patch.readAt }),
        ...(patch.payload !== undefined && { payload: patch.payload }),
      })
      .where(eq(notifications.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error(`notification ${id} not found`);
    return mapNotificationFromDb(row);
  }

  async list(filter: NotificationFilter): Promise<NotificationRecord[]> {
    const conditions = [eq(notifications.schoolId, filter.schoolId)];
    if (filter.userId) conditions.push(eq(notifications.userId, filter.userId));
    if (filter.guardianId) conditions.push(eq(notifications.guardianId, filter.guardianId));
    if (filter.status) conditions.push(eq(notifications.status, filter.status));
    if (filter.channel) conditions.push(eq(notifications.channel, filter.channel));
    if (filter.from) conditions.push(gte(notifications.createdAt, filter.from));
    if (filter.to) conditions.push(lte(notifications.createdAt, filter.to));
    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt));
    return rows.map(mapNotificationFromDb);
  }

  async countPaidSince(schoolId: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.schoolId, schoolId),
          gte(notifications.createdAt, since),
          inArray(notifications.channel, ['sms', 'whatsapp']),
        ),
      );
    return Number(row?.value ?? 0);
  }
}
