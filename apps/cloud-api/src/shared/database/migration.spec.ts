import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@cbt/shared-types';

describe('Migration Tests', () => {
  it('should have migration files generated', () => {
    const migrationsDir = './src/shared/database/migrations';
    expect(existsSync(migrationsDir)).toBe(true);
  });

  // Note: Full migration testing requires a real database connection.
  // These tests are skipped in CI and can be run locally with DATABASE_URL set.
  it.skip('should run migrations successfully', async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for migration tests');
    }

    const client = postgres(databaseUrl, { max: 1 });
    const db = drizzle(client, { schema });

    await migrate(db, { migrationsFolder: './src/shared/database/migrations' });

    // Verify tables exist by querying them
    const schools = await db.query.schools.findMany();
    expect(Array.isArray(schools)).toBe(true);

    const users = await db.query.users.findMany();
    expect(Array.isArray(users)).toBe(true);

    await client.end();
  });
});
