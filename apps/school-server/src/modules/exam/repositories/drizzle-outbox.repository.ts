import { Inject, Injectable } from '@nestjs/common';
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
}
