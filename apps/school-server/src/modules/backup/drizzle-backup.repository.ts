import { Inject, Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { DrizzleSqliteService, type SqliteDB } from '../../shared/database/drizzle-sqlite.service';
import { backupLog } from '../../shared/database/schema';
import type { BackupRecord, BackupRepository } from './backup.repository';

@Injectable()
export class DrizzleBackupRepository implements BackupRepository {
  constructor(@Inject(DrizzleSqliteService) private readonly drizzle: DrizzleSqliteService) {}

  private get db(): SqliteDB {
    return this.drizzle.getDb();
  }

  async record(entry: BackupRecord): Promise<void> {
    await this.db.insert(backupLog).values({
      at: entry.at,
      path: entry.path,
      bytes: entry.bytes,
      sha256: entry.sha256,
      ok: entry.ok,
    });
  }

  async list(limit: number): Promise<BackupRecord[]> {
    const rows = await this.db
      .select()
      .from(backupLog)
      .orderBy(desc(backupLog.at), desc(backupLog.id))
      .limit(limit);
    return rows.map((row) => ({
      at: row.at,
      path: row.path,
      bytes: row.bytes ?? null,
      sha256: row.sha256 ?? null,
      ok: row.ok,
    }));
  }

  async latest(): Promise<BackupRecord | null> {
    const [newest] = await this.list(1);
    return newest ?? null;
  }
}
