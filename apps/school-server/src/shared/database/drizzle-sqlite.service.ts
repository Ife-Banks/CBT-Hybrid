import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { LoggerService } from '../logger/logger.service';
import * as schema from './schema';

/** Concrete Drizzle handle for the school-server SQLite database. */
export type SqliteDB = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Where the generated migrations live. Checked in order so the same code works
 * under `tsx`/Vitest (`src/...`) and from a build (`dist/...`).
 */
const MIGRATIONS_DIR_CANDIDATES = [
  join(process.cwd(), 'dist', 'shared', 'database', 'migrations'),
  join(process.cwd(), 'src', 'shared', 'database', 'migrations'),
];

@Injectable()
export class DrizzleSqliteService implements OnModuleInit, OnModuleDestroy {
  private db: SqliteDB | null = null;
  private sqlite: Database.Database | null = null;

  constructor(
    private readonly config: SchoolConfigService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    mkdirSync(this.config.dataDir, { recursive: true });

    try {
      // Create SQLite database with better-sqlite3
      this.sqlite = new Database(this.config.dbPath);

      // Enable WAL mode and synchronous=FULL per architecture requirements
      this.sqlite.pragma('journal_mode = WAL');
      this.sqlite.pragma('synchronous = FULL');
      this.sqlite.pragma('foreign_keys = ON');

      // Create Drizzle instance
      this.db = drizzle(this.sqlite, { schema });

      await this.migrateSchema();

      this.logger.log('SQLite database connection established', 'DrizzleSqliteService');
    } catch (error) {
      this.logger.error('Failed to initialize SQLite database', error instanceof Error ? error.message : String(error), 'DrizzleSqliteService');
      throw error;
    }
  }

  /**
   * Bring the database up to the current schema. The exam API cannot work
   * without its tables, so migrations run on open rather than relying on a
   * separate deploy step. When no migrations folder is found (for example a
   * build that did not copy it) a warning is logged and startup continues.
   */
  private async migrateSchema(): Promise<void> {
    if (!this.db) return;

    const directory = this.migrationsDir();
    if (!directory) {
      this.logger.warn(
        'No migrations folder found; skipping schema migration',
        'DrizzleSqliteService',
      );
      return;
    }

    await migrate(this.db, { migrationsFolder: directory });
    this.logger.log('Schema migrations applied', 'DrizzleSqliteService');
  }

  private migrationsDir(): string | null {
    const candidates = [
      process.env.SCHOOL_MIGRATIONS_DIR,
      ...MIGRATIONS_DIR_CANDIDATES,
    ].filter((candidate): candidate is string => Boolean(candidate));

    return (
      candidates.find((candidate) => existsSync(join(candidate, 'meta', '_journal.json'))) ?? null
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sqlite) {
      this.sqlite.close();
      this.sqlite = null;
      this.db = null;
      this.logger.log('SQLite database connection closed', 'DrizzleSqliteService');
    }
  }

  /**
   * Check if database is connected and healthy
   */
  async healthCheck(): Promise<{ status: 'ok' | 'error'; responseTime?: string }> {
    if (!this.db) {
      return { status: 'error' };
    }

    try {
      const start = Date.now();
      this.sqlite?.prepare('SELECT 1').get();
      const responseTime = `${Date.now() - start}ms`;
      return { status: 'ok', responseTime };
    } catch (error) {
      this.logger.error('SQLite health check failed', error instanceof Error ? error.message : String(error), 'DrizzleSqliteService');
      return { status: 'error' };
    }
  }

  /**
   * Get the Drizzle instance
   * Throws if database is not configured
   */
  getDb(): SqliteDB {
    if (!this.db) {
      throw new Error('SQLite database not configured');
    }
    return this.db;
  }
}
