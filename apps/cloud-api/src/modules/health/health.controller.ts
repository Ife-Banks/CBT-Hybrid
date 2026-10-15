import { Controller, Get } from '@nestjs/common';
import { VERSION, type HealthCheck, type ServiceHealth } from '@cbt/shared-types';
import * as os from 'node:os';
import { ConfigService } from '../../common/config/config.service';
import { Public } from '../../common/decorators/public.decorator';

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

@Public()
@Controller()
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get('health')
  health(): HealthCheck {
    const services: Record<string, ServiceHealth> = {
      database: this.config.get('DATABASE_URL')
        ? { status: 'ok', details: 'configured; live check lands with the database in phase 3' }
        : { status: 'degraded', details: 'not configured' },
      redis: this.config.get('REDIS_URL')
        ? { status: 'ok', details: 'configured; live check lands with Redis in a later phase' }
        : { status: 'degraded', details: 'not configured' },
      memory: this.memory(),
    };

    const status = Object.values(services).some((service) => service.status === 'error')
      ? 'error'
      : 'ok';

    return {
      status,
      service: 'cloud-api',
      version: VERSION,
      timestamp: new Date().toISOString(),
      uptime: formatUptime(process.uptime()),
      services,
    };
  }

  private memory(): ServiceHealth {
    const usedMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const totalMb = Math.round(os.totalmem() / 1024 / 1024);
    return { status: 'ok', details: `${usedMb}MB of ${totalMb}MB` };
  }
}
