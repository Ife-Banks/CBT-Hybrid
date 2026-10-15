import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@cbt/shared-types';

/**
 * Run database migrations for the cloud API.
 *
 * This is a utility function that can be called from a CLI script or
 * during application startup if auto-migration is desired.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  console.log('Running database migrations...');
  await migrate(db, { migrationsFolder: './src/shared/database/migrations' });
  console.log('Migrations completed successfully');

  await client.end();
}
