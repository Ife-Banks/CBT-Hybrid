import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { VERSION, type HealthCheck, type ServiceHealth } from '@cbt/shared-types';
import { accessSync, constants, statfsSync } from 'node:fs';
import * as os from 'node:os';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { SqliteService } from '../../shared/database/sqlite.service';
import { DrizzleSqliteService } from '../../shared/database/drizzle-sqlite.service';
import { SyncService } from '../sync/sync.service';

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

class OfflineStatusDto {
  @ApiProperty({ type: Boolean, description: 'Whether the server is in offline mode' })
  offlineMode!: boolean;

  @ApiProperty({ type: Boolean, description: 'Whether sync is disabled due to offline mode' })
  syncDisabled!: boolean;

  @ApiProperty({ type: String, description: 'Last sync timestamp' })
  lastSyncAt!: string;

  @ApiProperty({ type: Number, description: 'Number of pending outbox events' })
  pendingOutboxEvents!: number;

  @ApiProperty({ type: Object, description: 'Pending outbox events grouped by type' })
  pendingOutboxByType!: Record<string, number>;

  @ApiProperty({ type: String, description: 'Roster sync cursor' })
  rosterCursor!: string;

  @ApiProperty({ type: String, description: 'Pack sync cursor' })
  packCursor!: string;

  @ApiProperty({ type: String, description: 'Cloud sync URL, if configured' })
  cloudSyncUrl!: string | null;
}

class HealthDetailsResponseDto extends Object {
  @ApiProperty({ type: String, enum: ['ok', 'error'] })
  declare status: 'ok' | 'error';

  @ApiProperty({ type: String })
  declare service: string;

  @ApiProperty({ type: String })
  declare version: string;

  @ApiProperty({ type: String, format: 'date-time' })
  declare timestamp: string;

  @ApiProperty({ type: String })
  declare uptime: string;

  @ApiProperty({ type: Object })
  declare services: Record<string, ServiceHealth>;

  @ApiProperty({ type: OfflineStatusDto })
  declare sync: OfflineStatusDto;
}

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly config: SchoolConfigService,
    private readonly sqlite: SqliteService,
    private readonly drizzle: DrizzleSqliteService,
    private readonly syncService: SyncService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint', description: 'Returns the health status of the school server including database, filesystem, memory, and sync service' })
  @ApiResponse({ status: 200, description: 'Health check successful', type: Object })
  @ApiResponse({ status: 503, description: 'Service unavailable' })
  async health(): Promise<HealthCheck> {
    const databaseCheck = await this.drizzle.healthCheck();
    const syncCheck = await this.checkSync();
    const services: Record<string, ServiceHealth> = {
      database: databaseCheck,
      filesystem: this.filesystem(),
      memory: this.memory(),
      sync: syncCheck,
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

  /**
   * Extended health endpoint that includes detailed sync diagnostics.
   */
  @Get('health/details')
  @ApiOperation({ summary: 'Detailed health check', description: 'Returns detailed health information including sync diagnostics (offline mode, pending outbox events, sync cursors)' })
  @ApiResponse({ status: 200, description: 'Detailed health check successful', type: HealthDetailsResponseDto })
  @ApiResponse({ status: 503, description: 'Service unavailable' })
  async healthDetails(): Promise<HealthCheck & { sync: OfflineStatusDto }> {
    const baseHealth = await this.health();
    const syncDetails = await this.getSyncDetails();
    return { ...baseHealth, sync: syncDetails };
  }

  private async checkSync(): Promise<ServiceHealth> {
    const started = Date.now();
    try {
      // Quick check: is the sync service functional?
      const offlineMode = this.config.isOfflineMode();
      const pendingCount = await this.syncService.getPendingOutboxEvents().then(events => events.length);
      const syncState = await this.syncService.getSyncStateDetails();
      const lastSyncAt = syncState.lastSyncAt;

      if (offlineMode) {
        return {
          status: 'degraded',
          responseTime: `${Date.now() - started}ms`,
          details: `Offline mode active. Pending outbox: ${pendingCount}. Last sync: ${lastSyncAt}`,
        };
      }

      // Try to get sync status from the service
      const status = await this.syncService.getStatus?.();

      return {
        status: 'ok',
        responseTime: `${Date.now() - started}ms`,
        details: `Pending outbox: ${pendingCount}. Last sync: ${lastSyncAt}`,
      };
    } catch (error) {
      return {
        status: 'error',
        responseTime: `${Date.now() - started}ms`,
        details: error instanceof Error ? error.message : 'Sync check failed',
      };
    }
  }

  private async getSyncDetails(): Promise<OfflineStatusDto> {
    const offlineMode = this.config.isOfflineMode();
    const syncState = await this.syncService.getSyncStateDetails();
    const pendingEvents = await this.syncService.getPendingOutboxEvents();
    const cloudSyncUrl = this.config.cloudSyncUrl ?? null;

    return {
      offlineMode,
      syncDisabled: offlineMode,
      lastSyncAt: syncState.lastSyncAt,
      pendingOutboxEvents: pendingEvents.length,
      pendingOutboxByType: this.groupByType(pendingEvents),
      rosterCursor: syncState.rosterCursor,
      packCursor: syncState.packCursor,
      cloudSyncUrl,
    };
  }

  private groupByType(events: any[]): Record<string, number> {
    return events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
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