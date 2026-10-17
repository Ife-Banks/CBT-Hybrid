import { Inject, Injectable, Logger } from '@nestjs/common';
import { OUTBOX_REPOSITORY, type OutboxRepository } from '../exam/repositories/outbox.repository';
import { SYNC_STATE_REPOSITORY, type SyncStateRepository } from './repositories/sync-state.repository';
import { PackImportService } from '../exam/pack-import.service';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { HttpClient } from './http-client';
import { DrizzleSqliteService } from '../../shared/database/drizzle-sqlite.service';
import { students, packs } from '../../shared/database/schema';
import { eq } from 'drizzle-orm';

export interface SyncResult {
  pushed: number;
  pulled: { roster: number; packs: number };
  errors: string[];
}

export interface HttpResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

interface RosterResponse {
  students: Array<{
    id: string;
    code: string;
    codeStatus: string;
    fullName: string;
    classId: string;
    section: string;
    photoPath: string | null;
    syncedAt: string;
  }>;
  cursor: string;
}

interface PacksResponse {
  packs: Array<{
    pack_id: string;
    pack_key: string;
    pack_bytes: string;
  }>;
  cursor: string;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private syncInProgress = false;

  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly outboxRepo: OutboxRepository,
    @Inject(SYNC_STATE_REPOSITORY) private readonly syncStateRepo: SyncStateRepository,
    private readonly packImport: PackImportService,
    private readonly config: SchoolConfigService,
    private readonly http: HttpClient,
    private readonly drizzle: DrizzleSqliteService,
  ) {}

  private get db(): ReturnType<DrizzleSqliteService['getDb']> {
    return this.drizzle.getDb();
  }

  async sync(): Promise<SyncResult> {
    // If running in offline mode, sync is disabled
    if (this.config.isOfflineMode()) {
      this.logger.warn('Sync called but server is in offline mode – operation skipped');
      return {
        pushed: 0,
        pulled: { roster: 0, packs: 0 },
        errors: ['Sync is disabled in offline mode'],
      };
    }

    if (this.syncInProgress) {
      this.logger.warn('Sync already in progress, skipping');
      return { pushed: 0, pulled: { roster: 0, packs: 0 }, errors: ['Sync already in progress'] };
    }

    this.syncInProgress = true;
    const errors: string[] = [];
    let pushed = 0;
    let pulledRoster = 0;
    let pulledPacks = 0;

    try {
      this.logger.log('Starting sync cycle');

      // Push pending outbox events
      const pushResult = await this.pushOutbox();
      pushed = pushResult.pushed;
      errors.push(...pushResult.errors);

      // Pull roster updates
      const rosterResult = await this.pullRoster();
      pulledRoster = rosterResult.count;
      errors.push(...rosterResult.errors);

      // Pull pack updates
      const packResult = await this.pullPacks();
      pulledPacks = packResult.count;
      errors.push(...packResult.errors);

      this.logger.log(`Sync complete: pushed ${pushed}, pulled roster ${pulledRoster}, pulled packs ${pulledPacks}`);
    } catch (error) {
      this.logger.error('Sync failed', error);
      errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      this.syncInProgress = false;
    }

    return { pushed, pulled: { roster: pulledRoster, packs: pulledPacks }, errors };
  }

  async getStatus(): Promise<{ status: string; last_sync: string | null; pending_events: number }> {
    const pendingCount = await this.outboxRepo.countPending?.() ?? 0;
    const lastSync = await this.syncStateRepo.get('last_sync_at');
    return {
      status: this.syncInProgress ? 'running' : 'idle',
      last_sync: lastSync ?? null,
      pending_events: pendingCount,
    };
  }

  private async pushOutbox(): Promise<{ pushed: number; errors: string[] }> {
    const errors: string[] = [];
    let pushed = 0;

    try {
      const cloudUrl = this.config.cloudSyncUrl;
      if (!cloudUrl) {
        errors.push('Cloud sync URL not configured');
        return { pushed, errors };
      }

      const now = new Date().toISOString();
      const pending = await this.outboxRepo.listPending(now);

      if (pending.length === 0) {
        this.logger.debug('No pending outbox events to push');
        return { pushed, errors };
      }

      this.logger.debug(`Pushing ${pending.length} outbox events to cloud`);

      const eventsByType = this.groupEventsByType(pending);

      for (const [type, events] of Object.entries(eventsByType)) {
        try {
          const eventIds = events.map((e) => e.eventId);
          const response = await this.http.post(`${cloudUrl}/sync/v1/results`, {
            type,
            events: events.map((e) => ({
              event_id: e.eventId,
              payload: JSON.parse(e.payloadJson),
              created_at: e.createdAt,
            })),
          });

          if (response.ok) {
            await this.outboxRepo.acknowledge(eventIds, now);
            pushed += eventIds.length;
            this.logger.debug(`Acknowledged ${eventIds.length} ${type} events`);
          } else {
            const retryDelay = this.calculateRetryDelay(events[0].attempts);
            const nextAttemptAt = new Date(Date.now() + retryDelay).toISOString();
            await this.outboxRepo.incrementAttempts(
              eventIds,
              nextAttemptAt,
              response.error ?? 'Unknown error',
            );
            errors.push(`Failed to push ${type} events: ${response.error}`);
          }
        } catch (error) {
          this.logger.error(`Failed to push ${type} events`, error);
          errors.push(`Failed to push ${type} events: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      this.logger.error('Push outbox failed', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return { pushed, errors };
  }

  private async pullRoster(): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      const cloudUrl = this.config.cloudSyncUrl;
      if (!cloudUrl) {
        errors.push('Cloud sync URL not configured');
        return { count, errors };
      }

      const lastSync = await this.syncStateRepo.get('roster_cursor');
      const response = await this.http.get<RosterResponse>(`${cloudUrl}/sync/v1/roster?since=${lastSync ?? ''}`);

      if (response.ok && response.data && Array.isArray(response.data.students)) {
        // Process student updates
        const studentsData = response.data.students;
        for (const student of studentsData) {
          await this.db
            .insert(students)
            .values({
              id: student.id,
              code: student.code,
              codeStatus: student.codeStatus,
              fullName: student.fullName,
              classId: student.classId,
              section: student.section,
              photoPath: student.photoPath,
              syncedAt: student.syncedAt,
            })
            .onConflictDoUpdate({
              target: students.id,
              set: {
                code: student.code,
                codeStatus: student.codeStatus,
                fullName: student.fullName,
                classId: student.classId,
                section: student.section,
                photoPath: student.photoPath,
                syncedAt: student.syncedAt,
              },
            });
        }
        count = studentsData.length;
        this.logger.debug(`Pulled ${count} roster updates`);
      } else {
        errors.push(`Failed to pull roster: ${response.error}`);
      }
    } catch (error) {
      this.logger.error('Pull roster failed', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return { count, errors };
  }

  private async pullPacks(): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      const cloudUrl = this.config.cloudSyncUrl;
      if (!cloudUrl) {
        errors.push('Cloud sync URL not configured');
        return { count, errors };
      }

      const lastSync = await this.syncStateRepo.get('pack_cursor');
      const response = await this.http.get<PacksResponse>(`${cloudUrl}/sync/v1/packs?since=${lastSync ?? ''}`);

      if (response.ok && response.data) {
        for (const packData of response.data.packs ?? []) {
          try {
            const packKey = Buffer.from(packData.pack_key, 'base64');
            const packBytes = Buffer.from(packData.pack_bytes, 'base64');
            await this.packImport.importPack({ bytes: packBytes, packKey });
            count++;
          } catch (error) {
            this.logger.error(`Failed to import pack ${packData.pack_id}`, error);
            errors.push(`Failed to import pack ${packData.pack_id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        const newCursor = response.data.cursor ?? new Date().toISOString();
        await this.syncStateRepo.set('pack_cursor', newCursor);
        this.logger.debug(`Pulled ${count} pack updates`);
      } else {
        errors.push(`Failed to pull packs: ${response.error}`);
      }
    } catch (error) {
      this.logger.error('Pull packs failed', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return { count, errors };
  }

  private groupEventsByType(events: any[]): Record<string, any[]> {
    return events.reduce((acc, event) => {
      if (!acc[event.type]) {
        acc[event.type] = [];
      }
      acc[event.type].push(event);
      return acc;
    }, {} as Record<string, any[]>);
  }

  private calculateRetryDelay(attempt: number): number {
    const delays = [1000, 2000, 4000, 8000, 16000, 32000, 60000];
    const index = Math.min(attempt, delays.length - 1);
    return delays[index] ?? 60000;
  }

  private groupByType(events: any[]): Record<string, number> {
    return events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /** Get comprehensive offline readiness status */
  async getOfflineStatus(): Promise<{
    offlineMode: boolean;
    syncDisabled: boolean;
    lastSyncAt: string;
    pendingOutboxEvents: number;
    pendingOutboxByType: Record<string, number>;
    rosterCursor: string;
    packCursor: string;
    cloudSyncUrl: string | undefined;
  }> {
    const offlineMode = this.config.isOfflineMode();
    const syncDisabled = offlineMode;
    const syncState = await this.getSyncStateDetails();
    const pendingEvents = await this.getPendingOutboxEvents();
    const cloudSyncUrl = this.config.cloudSyncUrl;

    return {
      offlineMode,
      syncDisabled,
      lastSyncAt: syncState.lastSyncAt,
      pendingOutboxEvents: pendingEvents.length,
      pendingOutboxByType: this.groupByType(pendingEvents),
      rosterCursor: syncState.rosterCursor,
      packCursor: syncState.packCursor,
      cloudSyncUrl,
    };
  }

  /** Get pending outbox events for health check */
  async getPendingOutboxEvents(): Promise<Array<{ eventId: string; type: string; payload: unknown; createdAt: string }>> {
    const now = new Date().toISOString();
    return this.outboxRepo.listPending(now);
  }

  /** Get detailed sync state for health check */
  async getSyncStateDetails(): Promise<{
    rosterCursor: string;
    packCursor: string;
    lastSyncAt: string;
  }> {
    const rosterCursor = await this.syncStateRepo.get('roster_cursor') ?? 'never';
    const packCursor = await this.syncStateRepo.get('pack_cursor') ?? 'never';
    const lastSyncAt = await this.syncStateRepo.get('last_sync_at') ?? 'never';
    return { rosterCursor, packCursor, lastSyncAt };
  }
}