import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { ConfigService } from '../../common/config/config.service';
import { LoggerService } from '../logger/logger.service';
import * as schema from '@cbt/shared-types';

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  private client: postgres.Sql | null = null;
  public db: DrizzleDB | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    const databaseUrl = this.config.get('DATABASE_URL') as string | undefined;

    if (!databaseUrl) {
      this.logger.warn('DATABASE_URL not configured, using in-memory repositories');
      return;
    }

    try {
      // Create postgres client with connection pooling
      this.client = postgres(databaseUrl, {
        max: 20, // Connection pool size
        idle_timeout: 20,
        connect_timeout: 10,
      });

      // Create Drizzle instance
      this.db = drizzle(this.client, { schema });

      this.logger.log('Database connection established', 'DrizzleService');
    } catch (error) {
      this.logger.error('Failed to connect to database', error instanceof Error ? error.message : String(error), 'DrizzleService');
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.end();
      this.logger.log('Database connection closed', 'DrizzleService');
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
      await this.db.execute(sql`SELECT 1`);
      const responseTime = `${Date.now() - start}ms`;
      return { status: 'ok', responseTime };
    } catch (error) {
      this.logger.error('Database health check failed', error instanceof Error ? error.message : String(error), 'DrizzleService');
      return { status: 'error' };
    }
  }

  /**
   * Get the Drizzle instance
   * Throws if database is not configured
   */
  getDb() {
    if (!this.db) {
      throw new Error('Database not configured');
    }
    return this.db;
  }
}
