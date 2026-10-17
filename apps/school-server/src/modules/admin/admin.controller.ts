import {
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { SyncResult } from '../sync/sync.service';

@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);
  private readonly adminService: AdminService;

  constructor(adminService: AdminService) {
    this.adminService = adminService;
  }

  /**
   * POST /admin/sync/trigger - manually trigger a sync cycle.
   */
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

  /**
   * GET /admin/status - get current sync status and diagnostics.
   */
  @Get('status')
  @HttpCode(HttpStatus.OK)
  async getStatus() {
    return this.adminService.getStatus();
  }
}