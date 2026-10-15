import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

/**
 * Run database migrations for the school server.
 *
 * This is a utility function that can be called from a CLI script or
 * during application startup if auto-migration is desired.
 */
export async function runMigrations(dbPath: string): Promise<void> {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = FULL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  console.log('Running SQLite database migrations...');
  await migrate(db, { migrationsFolder: './src/shared/database/migrations' });
  console.log('Migrations completed successfully');

  sqlite.close();
}
