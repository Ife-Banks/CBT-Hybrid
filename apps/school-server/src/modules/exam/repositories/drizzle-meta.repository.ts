import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleSqliteService } from '../../../shared/database/drizzle-sqlite.service';
import type { SqliteDB } from '../../../shared/database/drizzle-sqlite.service';
import { meta } from '../../../shared/database/schema';
import type { MetaRepository } from './meta.repository';

@Injectable()
export class DrizzleMetaRepository implements MetaRepository {
  constructor(@Inject(DrizzleSqliteService) private readonly drizzle: DrizzleSqliteService) {}

  private get db(): SqliteDB {
    return this.drizzle.getDb();
  }

  async get(key: string): Promise<string | null> {
    const rows = await this.db.select().from(meta).where(eq(meta.key, key)).limit(1);
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db
      .insert(meta)
      .values({ key, value })
      .onConflictDoUpdate({ target: meta.key, set: { value } });
  }
}
