import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { SyncResult } from '../sync/sync.service';
import { isConflictStrategy, type ConflictStrategy } from '../sync/domain/conflict-strategies';

@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);
  private readonly adminService: AdminService;

  constructor(adminService: AdminService) {
    this.adminService = adminService;
  }

  /** POST /admin/sync/trigger - manually trigger a sync cycle. */
  @Post('sync/trigger')
  @HttpCode(HttpStatus.OK)
  async triggerSync(): Promise<SyncResult> {
    try {
      return await this.adminService.triggerSync();
    } catch (error) {
      this.logger.error('Failed to trigger sync', error);
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  /** GET /admin/status - current sync status and diagnostics. */
  @Get('status')
  @HttpCode(HttpStatus.OK)
  async getStatus() {
    return this.adminService.getStatus();
  }

  /** GET /admin/sync/health - detailed sync health for the dashboard. */
  @Get('sync/health')
  @HttpCode(HttpStatus.OK)
  async getSyncHealth() {
    try {
      return await this.adminService.getSyncHealth();
    } catch (error) {
      this.logger.error('Failed to get sync health', error);
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  /** GET /admin/sync/analytics - aggregate sync statistics. */
  @Get('sync/analytics')
  @HttpCode(HttpStatus.OK)
  async getAnalytics(@Query('days') days?: string) {
    const parsed = days ? Number(days) : 30;
    return this.adminService.getAnalytics(Number.isFinite(parsed) ? parsed : 30);
  }

  /** GET /admin/sync/metrics - recent per-cycle metrics. */
  @Get('sync/metrics')
  @HttpCode(HttpStatus.OK)
  async getMetrics(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 20;
    return this.adminService.getMetrics(Number.isFinite(parsed) ? parsed : 20);
  }

  /** GET /admin/sync/conflicts - recorded conflicts. */
  @Get('sync/conflicts')
  @HttpCode(HttpStatus.OK)
  async getConflicts(@Query('status') status?: 'open' | 'resolved' | 'ignored') {
    return this.adminService.getConflicts({ status });
  }

  /** POST /admin/sync/conflicts/:id/resolve - settle an open conflict. */
  @Post('sync/conflicts/:id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveConflict(
    @Param('id') id: string,
    @Body() body: { strategy?: string; resolved_by?: string },
  ) {
    const strategy = body?.strategy ?? 'local_wins';
    if (!isConflictStrategy(strategy)) {
      throw new BadRequestException(
        `Unknown strategy '${strategy}'. Expected one of local_wins, remote_wins, newest_wins, merge, manual`,
      );
    }
    const resolved = await this.adminService.resolveConflict(
      id,
      strategy as ConflictStrategy,
      body?.resolved_by ?? 'admin',
    );
    if (!resolved) throw new BadRequestException(`Conflict ${id} is not open`);
    return resolved;
  }

  /** POST /admin/sync/conflicts/:id/ignore - dismiss an open conflict. */
  @Post('sync/conflicts/:id/ignore')
  @HttpCode(HttpStatus.OK)
  async ignoreConflict(@Param('id') id: string) {
    const ignored = await this.adminService.ignoreConflict(id);
    if (!ignored) throw new BadRequestException(`Conflict ${id} not found`);
    return { ignored };
  }

  /** GET /admin/sync/retries - recent outbox retry attempts. */
  @Get('sync/retries')
  @HttpCode(HttpStatus.OK)
  async getRetries(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 50;
    return this.adminService.getRetryHistory(Number.isFinite(parsed) ? parsed : 50);
  }

  /** GET /admin/sync/checkpoints - resumable checkpoints. */
  @Get('sync/checkpoints')
  @HttpCode(HttpStatus.OK)
  async getCheckpoints() {
    return this.adminService.getCheckpoints();
  }

  /** POST /admin/sync/recover - mark interrupted runs failed after a restart. */
  @Post('sync/recover')
  @HttpCode(HttpStatus.OK)
  async recover() {
    return this.adminService.recoverInterrupted();
  }
}
