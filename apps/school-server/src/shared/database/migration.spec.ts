import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

describe('SQLite Migration Tests', () => {
  const testDbPath = './test-data/test-school.db';

  afterEach(() => {
    if (existsSync(testDbPath)) {
      try {
        rmSync(testDbPath);
      } catch (error) {
        // Ignore permission errors - the file may be locked by SQLite
        console.warn('Could not remove test database file:', error);
      }
    }
  });

  it('should have migration files generated', () => {
    const migrationsDir = './src/shared/database/migrations';
    expect(existsSync(migrationsDir)).toBe(true);
  });

  it('should run migrations successfully on SQLite', async () => {
    mkdirSync('./test-data', { recursive: true });

    const sqlite = new Database(testDbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = FULL');
    sqlite.pragma('foreign_keys = ON');

    const db = drizzle(sqlite, { schema });

    await migrate(db, { migrationsFolder: './src/shared/database/migrations' });

    // Verify tables exist by querying them
    const schools = db.select().from(schema.schools).all();
    expect(Array.isArray(schools)).toBe(true);

    const users = db.select().from(schema.users).all();
    expect(Array.isArray(users)).toBe(true);

    sqlite.close();
  });
});
