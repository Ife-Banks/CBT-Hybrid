import { Body, Controller, Get, Post } from '@nestjs/common';
import { SyncService } from './sync.service';

/**
 * Sync Agent API (API spec section 13).
 * Triggers and monitors sync operations between school server and cloud.
 */
@Controller('api/v1/sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /** `POST /trigger` - trigger a manual sync cycle. */
  @Post('trigger')
  async trigger() {
    return this.syncService.sync();
  }

  /** `GET /status` - get sync status and queue information. */
  @Get('status')
  async status() {
    // TODO: Return sync status from sync state
    return { status: 'idle', last_sync: null, pending_events: 0 };
  }
}
