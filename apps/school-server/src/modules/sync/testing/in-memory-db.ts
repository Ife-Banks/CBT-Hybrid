import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { DrizzleSqliteService, SqliteDB } from '../../../shared/database/drizzle-sqlite.service';
import * as schema from '../../../shared/database/schema';

/**
 * Test-only helper: a migrated, in-memory school-server database plus a stub
 * `DrizzleSqliteService` whose `getDb()` returns it. Repositories depend on the
 * service only through `getDb()`, so the stub is all a unit test needs.
 */

const MIGRATIONS_DIR = [
  join(process.cwd(), 'src', 'shared', 'database', 'migrations'),
  join(process.cwd(), 'dist', 'shared', 'database', 'migrations'),
].find((dir) => existsSync(join(dir, 'meta', '_journal.json')));

export interface InMemoryDb {
  db: SqliteDB;
  sqlite: Database.Database;
  service: DrizzleSqliteService;
  close(): void;
}

export async function createInMemoryDb(): Promise<InMemoryDb> {
  if (!MIGRATIONS_DIR) {
    throw new Error('Could not locate the school-server migrations folder for tests');
  }
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  const service = { getDb: () => db } as unknown as DrizzleSqliteService;
  return { db, sqlite, service, close: () => sqlite.close() };
}
