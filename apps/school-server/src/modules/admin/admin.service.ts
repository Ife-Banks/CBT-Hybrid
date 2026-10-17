import { Injectable, Logger } from '@nestjs/common';
import { SyncService, type SyncResult, type SyncStatus } from '../sync/sync.service';
import type { ConflictStrategy } from '../sync/domain/conflict-strategies';
import type { SyncAnalytics, SyncConflictRecord, SyncRetryRecord } from '../sync/domain/types';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly syncService: SyncService;

  constructor(syncService: SyncService) {
    this.syncService = syncService;
  }

  /** Trigger a manual sync cycle. */
  async triggerSync(): Promise<SyncResult> {
    return this.syncService.sync();
  }

  /** Current sync status and queue metrics. */
  async getStatus(): Promise<SyncStatus> {
    return this.syncService.getStatus();
  }

  /**
   * Detailed sync health for the monitoring dashboard: offline mode, cursors,
   * pending events, open conflicts and live progress.
   */
  async getSyncHealth(): Promise<{
    offlineMode: boolean;
    syncDisabled: boolean;
    schoolId: string;
    lastSyncAt: string;
    pendingOutboxEvents: number;
    pendingOutboxByType: Record<string, number>;
    rosterCursor: string;
    packCursor: string;
    cloudSyncUrl: string | null;
    syncInProgress: boolean;
    syncErrorCount: number;
    openConflicts: number;
    progress: SyncStatus['progress'];
  }> {
    const offlineStatus = await this.syncService.getOfflineStatus();
    const status = await this.syncService.getStatus();

    return {
      offlineMode: offlineStatus.offlineMode,
      syncDisabled: offlineStatus.syncDisabled,
      schoolId: offlineStatus.schoolId,
      lastSyncAt: offlineStatus.lastSyncAt,
      pendingOutboxEvents: offlineStatus.pendingOutboxEvents,
      pendingOutboxByType: offlineStatus.pendingOutboxByType,
      rosterCursor: offlineStatus.rosterCursor,
      packCursor: offlineStatus.packCursor,
      cloudSyncUrl: offlineStatus.cloudSyncUrl ?? null,
      syncInProgress: status.status === 'running',
      syncErrorCount: status.pending_events,
      openConflicts: offlineStatus.openConflicts,
      progress: status.progress,
    };
  }

  /** Aggregate sync analytics. */
  async getAnalytics(days = 30): Promise<SyncAnalytics> {
    return this.syncService.getAnalytics(days);
  }

  /** Recent per-cycle metrics. */
  async getMetrics(limit = 20) {
    return this.syncService.getRecentMetrics(limit);
  }

  /** Recorded conflicts. */
  async getConflicts(
    filter: { status?: 'open' | 'resolved' | 'ignored'; limit?: number } = {},
  ): Promise<SyncConflictRecord[]> {
    return this.syncService.getConflicts(filter);
  }

  /** Resolve an open conflict. */
  async resolveConflict(
    id: string,
    strategy: ConflictStrategy,
    resolvedBy = 'admin',
  ): Promise<SyncConflictRecord | null> {
    return this.syncService.resolveConflict(id, strategy, resolvedBy);
  }

  /** Dismiss an open conflict. */
  async ignoreConflict(id: string): Promise<boolean> {
    return this.syncService.ignoreConflict(id);
  }

  /** Recent retry attempts. */
  async getRetryHistory(limit = 50): Promise<SyncRetryRecord[]> {
    return this.syncService.getRetryHistory(limit);
  }

  /** Resumable checkpoints after a crash. */
  async getCheckpoints() {
    return this.syncService.getResumableCheckpoints();
  }

  /** Mark interrupted runs failed. */
  async recoverInterrupted() {
    return this.syncService.recoverInterrupted();
  }
}
