import { Injectable, Logger } from '@nestjs/common';
import { SyncService } from '../sync/sync.service';
import { SyncResult } from '../sync/sync.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly syncService: SyncService;

  constructor(syncService: SyncService) {
    this.syncService = syncService;
  }

  /**
   * Trigger a manual sync cycle.
   * Returns sync results or an error if sync is disabled.
   */
  async triggerSync(): Promise<SyncResult> {
    return this.syncService.sync();
  }

  /**
   * Get current sync status and queue metrics.
   */
  async getStatus() {
    return this.syncService.getStatus();
  }
}