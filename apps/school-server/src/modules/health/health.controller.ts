import { Controller, Get } from '@nestjs/common';
import { VERSION, type HealthCheck, type ServiceHealth } from '@cbt/shared-types';
import { accessSync, constants, statfsSync } from 'node:fs';
import * as os from 'node:os';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { SqliteService } from '../../shared/database/sqlite.service';
import { DrizzleSqliteService } from '../../shared/database/drizzle-sqlite.service';

/** Human-readable uptime, for example `2h 34m 12s`. */
function formatUptime(seconds: number): string {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

@Controller()
export class HealthController {
  constructor(
    private readonly config: SchoolConfigService,
    private readonly sqlite: SqliteService,
    private readonly drizzle: DrizzleSqliteService,
  ) {}

  @Get('health')
  async health(): Promise<HealthCheck> {
    const databaseCheck = await this.drizzle.healthCheck();
    const services: Record<string, ServiceHealth> = {
      database: databaseCheck,
      filesystem: this.filesystem(),
      memory: this.memory(),
    };

    const status = Object.values(services).some((service) => service.status === 'error')
      ? 'error'
      : 'ok';

    return {
      status,
      service: 'school-server',
      version: VERSION,
      timestamp: new Date().toISOString(),
      uptime: formatUptime(process.uptime()),
      services,
    };
  }

  private filesystem(): ServiceHealth {
    const started = Date.now();
    try {
      accessSync(this.config.dataDir, constants.W_OK);
      const stats = statfsSync(this.config.dataDir);
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      const freeMb = Math.round(freeBytes / 1024 / 1024);
      return {
        status: 'ok',
        responseTime: `${Date.now() - started}ms`,
        details: `${freeMb}MB free`,
      };
    } catch (error) {
      return {
        status: 'error',
        responseTime: `${Date.now() - started}ms`,
        details: error instanceof Error ? error.message : 'filesystem not writable',
      };
    }
  }

  private memory(): ServiceHealth {
    const usedMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const totalMb = Math.round(os.totalmem() / 1024 / 1024);
    return { status: 'ok', details: `${usedMb}MB of ${totalMb}MB` };
  }
}
