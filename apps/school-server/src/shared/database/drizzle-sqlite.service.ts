import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { backupName } from '../../common/fs/backup-name';
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

    await this.copyBeforeMigration(directory);
    await migrate(this.db, { migrationsFolder: directory });
    this.logger.log('Schema migrations applied', 'DrizzleSqliteService');
  }

  /**
   * Migrations change the schema in place and are forward-only, so a copy of
   * the database is taken before they run (CBT-04 sections 5.9 and 6.1). Only
   * upgrades are copied: a brand new database has nothing worth keeping, and
   * skipping it keeps startup silent on first run.
   */
  private async copyBeforeMigration(directory: string): Promise<void> {
    if (!this.sqlite) return;
    if (!this.pendingMigrations(directory)) return;

    const target = join(this.config.preMigrationBackupsDir, backupName('pre-migration'));
    try {
      mkdirSync(this.config.preMigrationBackupsDir, { recursive: true });
      await this.sqlite.backup(target);
      this.pruneDirectory(this.config.preMigrationBackupsDir, 3);
      this.logger.log(`Backed up the database before migrating: ${target}`, 'DrizzleSqliteService');
    } catch (error) {
      // A failed backup must not stop the school server from starting.
      this.logger.warn(
        `Could not back up before migrating: ${error instanceof Error ? error.message : String(error)}`,
        'DrizzleSqliteService',
      );
    }
  }

  /** Whether the folder has migrations this database has not applied yet. */
  private pendingMigrations(directory: string): boolean {
    if (!this.sqlite) return false;
    try {
      const journal = JSON.parse(
        readFileSync(join(directory, 'meta', '_journal.json'), 'utf8'),
      ) as { entries?: unknown[] };
      const expected = journal.entries?.length ?? 0;
      if (expected === 0) return false;

      const row = this.sqlite
        .prepare('SELECT count(*) AS applied FROM __drizzle_migrations')
        .get() as { applied?: number } | undefined;
      const applied = Number(row?.applied ?? 0);
      // Applied count above zero means this is an existing school database.
      return applied > 0 && applied < expected;
    } catch {
      // No migrations table yet: a new database, so nothing to lose.
      return false;
    }
  }

  /** Keep the newest `keep` files in a backup folder. */
  private pruneDirectory(directory: string, keep: number): void {
    try {
      const files = readdirSync(directory)
        .filter((name) => name.endsWith('.db'))
        .sort()
        .reverse();
      for (const name of files.slice(keep)) {
        rmSync(join(directory, name), { force: true });
      }
    } catch {
      // Pruning is housekeeping; never let it break startup.
    }
  }

  /**
   * Write a consistent copy of the open database (the SQLite backup API,
   * CBT-04 section 6.6). Safe to run while the Exam API is serving.
   */
  async backupTo(destination: string): Promise<void> {
    if (!this.sqlite) throw new Error('SQLite database not configured');
    mkdirSync(dirname(destination), { recursive: true });
    await this.sqlite.backup(destination);
  }

  /** `PRAGMA integrity_check`, used by the detailed health view and after a restore. */
  integrityCheck(): string {
    if (!this.sqlite) return 'database not configured';
    try {
      const rows = this.sqlite.pragma('integrity_check') as Array<{ integrity_check?: string }>;
      const first = rows[0]?.integrity_check;
      return typeof first === 'string' ? first : 'unknown';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
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
