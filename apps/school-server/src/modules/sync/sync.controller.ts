import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { isConflictStrategy, type ConflictStrategy } from './domain/conflict-strategies';
import { SyncService } from './sync.service';

/**
 * Sync Agent API (API spec section 13, Phase 8).
 * Triggers and monitors sync operations between the school server and cloud.
 */
@ApiTags('sync')
@Controller('api/v1/sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /** `POST /trigger` - trigger a manual sync cycle. */
  @Post('trigger')
  @ApiOperation({ summary: 'Trigger a manual sync cycle' })
  async trigger() {
    return this.syncService.sync();
  }

  /** `GET /status` - sync status, counters and live progress. */
  @Get('status')
  @ApiOperation({ summary: 'Get sync status and live progress' })
  async status() {
    return this.syncService.getStatus();
  }

  /** `GET /progress` - live progress of the in-flight/last cycle. */
  @Get('progress')
  @ApiOperation({ summary: 'Get live sync progress (percent, ETA, phase)' })
  async progress() {
    return this.syncService.getProgress();
  }

  /** `GET /analytics` - aggregate statistics over a window. */
  @Get('analytics')
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiOperation({ summary: 'Get sync statistics and trends' })
  async analytics(@Query('days') days?: string) {
    const parsed = days ? Number(days) : 30;
    return this.syncService.getAnalytics(Number.isFinite(parsed) ? parsed : 30);
  }

  /** `GET /metrics` - recent per-cycle metrics. */
  @Get('metrics')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({ summary: 'List recent sync-cycle metrics' })
  async metrics(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 20;
    return this.syncService.getRecentMetrics(Number.isFinite(parsed) ? parsed : 20);
  }

  /** `GET /conflicts` - recorded conflicts, newest first. */
  @Get('conflicts')
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'resolved', 'ignored'] })
  @ApiOperation({ summary: 'List detected sync conflicts' })
  async conflicts(@Query('status') status?: 'open' | 'resolved' | 'ignored') {
    return this.syncService.getConflicts({ status });
  }

  /** `POST /conflicts/:id/resolve` - settle an open conflict. */
  @Post('conflicts/:id/resolve')
  @ApiOperation({ summary: 'Resolve an open conflict with a strategy' })
  async resolve(
    @Param('id') id: string,
    @Body() body: { strategy?: string; resolved_by?: string },
  ) {
    const strategy = body?.strategy ?? 'local_wins';
    const safeStrategy: ConflictStrategy = isConflictStrategy(strategy) ? strategy : 'local_wins';
    return this.syncService.resolveConflict(id, safeStrategy, body?.resolved_by ?? 'admin');
  }

  /** `POST /conflicts/:id/ignore` - dismiss an open conflict. */
  @Post('conflicts/:id/ignore')
  @ApiOperation({ summary: 'Ignore an open conflict without applying either side' })
  async ignore(@Param('id') id: string) {
    const ignored = await this.syncService.ignoreConflict(id);
    return { ignored };
  }

  /** `GET /retries` - recent outbox retry attempts. */
  @Get('retries')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({ summary: 'List recent outbox retry attempts' })
  async retries(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 50;
    return this.syncService.getRetryHistory(Number.isFinite(parsed) ? parsed : 50);
  }

  /** `GET /checkpoints` - non-terminal checkpoints for crash recovery. */
  @Get('checkpoints')
  @ApiOperation({ summary: 'List resumable sync checkpoints' })
  async checkpoints() {
    return this.syncService.getResumableCheckpoints();
  }
}
