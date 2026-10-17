import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, or, sql, count } from 'drizzle-orm';
import { DrizzleSqliteService } from '../../../shared/database/drizzle-sqlite.service';
import type { SqliteDB } from '../../../shared/database/drizzle-sqlite.service';
import { outbox } from '../../../shared/database/schema';
import type { OutboxEventRecord } from '../domain/types';
import type { OutboxRepository } from './outbox.repository';

@Injectable()
export class DrizzleOutboxRepository implements OutboxRepository {
  constructor(@Inject(DrizzleSqliteService) private readonly drizzle: DrizzleSqliteService) {}

  private get db(): SqliteDB {
    return this.drizzle.getDb();
  }

  async insert(event: OutboxEventRecord): Promise<void> {
    await this.db.insert(outbox).values({
      eventId: event.eventId,
      type: event.type,
      payloadJson: JSON.stringify(event.payload),
      createdAt: event.createdAt,
      attempts: 0,
    });
  }

  async listPending(now: string): Promise<OutboxEventRecord[]> {
    const rows = await this.db
      .select()
      .from(outbox)
      .where(
        and(
          isNull(outbox.ackedAt),
          or(isNull(outbox.nextAttemptAt), eq(outbox.nextAttemptAt, now.replace('Z', ''))),
        ),
      );
    return rows.map((row) => ({
      eventId: row.eventId,
      type: row.type,
      payload: JSON.parse(row.payloadJson),
      createdAt: row.createdAt,
      attempts: row.attempts,
    }));
  }

  async countPending(now?: string): Promise<number> {
    const nowStr = now ?? new Date().toISOString();
    const result = await this.db
      .select({ count: count() })
      .from(outbox)
      .where(
        and(
          isNull(outbox.ackedAt),
          or(isNull(outbox.nextAttemptAt), eq(outbox.nextAttemptAt, nowStr.replace('Z', ''))),
        ),
      );
    return result[0]?.count ?? 0;
  }

  async acknowledge(eventIds: string[], ackedAt: string): Promise<void> {
    if (eventIds.length === 0) return;
    await this.db
      .update(outbox)
      .set({ ackedAt })
      .where(and(isNull(outbox.ackedAt), inArray(outbox.eventId, eventIds)));
  }

  async incrementAttempts(eventIds: string[], nextAttemptAt: string, errorMsg: string): Promise<void> {
    if (eventIds.length === 0) return;
    await this.db
      .update(outbox)
      .set({
        attempts: sql`${outbox.attempts} + 1`,
        nextAttemptAt,
        errorMsg,
      })
      .where(and(isNull(outbox.ackedAt), inArray(outbox.eventId, eventIds)));
  }
}
