import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { LoggerService } from '../logger/logger.service';
import * as schema from './schema';

@Injectable()
export class DrizzleSqliteService implements OnModuleInit, OnModuleDestroy {
  private db: ReturnType<typeof drizzle> | null = null;
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

      this.logger.log('SQLite database connection established', 'DrizzleSqliteService');
    } catch (error) {
      this.logger.error('Failed to initialize SQLite database', error instanceof Error ? error.message : String(error), 'DrizzleSqliteService');
      throw error;
    }
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
  getDb() {
    if (!this.db) {
      throw new Error('SQLite database not configured');
    }
    return this.db;
  }
}
