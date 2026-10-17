import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { students } from '../../shared/database/schema';
import { DrizzleSqliteService } from '../../shared/database/drizzle-sqlite.service';
import { SchoolConfigService } from '../../common/config/school-config.service';
import {
  OUTBOX_REPOSITORY,
  type OutboxRepository,
} from '../exam/repositories/outbox.repository';
import { PackImportService } from '../exam/pack-import.service';
import { HttpClient } from './http-client';
import { ConflictResolutionService } from './conflict-resolution.service';
import type { ConflictStrategy } from './domain/conflict-strategies';
import { chunk, processInBatches } from './domain/batch';
import type {
  SyncAnalytics,
  SyncConflictRecord,
  SyncEntityType,
  SyncMetricsRecord,
  SyncProgress,
  SyncRetryRecord,
  SyncRunStatus,
} from './domain/types';
import {
  SYNC_ENTITY_VERSION_REPOSITORY,
  type EntityVersionRepository,
} from './repositories/entity-version.repository';
import {
  SYNC_RETRY_REPOSITORY,
  type SyncRetryRepository,
} from './repositories/sync-retry.repository';
import { SyncMetricsService } from './sync-metrics.service';
import { SyncProgressService } from './sync-progress.service';
import { SyncScopeService } from './sync-scope.service';

/** Records handled per commit group during a pull. */
export const SYNC_BATCH_SIZE = 200;

export interface SyncResult {
  pushed: number;
  pulled: { roster: number; packs: number };
  errors: string[];
}

export interface SyncStatus {
  status: string;
  last_sync: string | null;
  pending_events: number;
  school_id: string;
  progress: SyncProgress | null;
}

interface RemoteStudent {
  id: string;
  code: string;
  codeStatus: string;
  fullName: string;
  classId: string | null;
  section: string;
  photoPath: string | null;
  syncedAt: string;
  /** Cloud-assigned version; absence means "treat as changed". */
  version?: number;
  updated_at?: string;
}

interface RosterResponse {
  students: RemoteStudent[];
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

/** The mergeable view of a student row. */
type StudentView = {
  code: string;
  codeStatus: string;
  fullName: string;
  classId: string | null;
  section: string;
  photoPath: string | null;
};

/** Sync state for delta calculations. */
export interface SyncState {
  lastSyncAt: string | null;
  rosterCursor: string;
  packCursor: string;
  lastPushedEventId: string | null;
}

interface PullCounters {
  conflictsDetected: number;
  conflictsResolved: number;
  bytes: number;
}

/**
 * Sync agent (API spec section 13, CBT-Phase-8-SyncSystem).
 *
 * Orchestrates one cycle: push pending outbox events, pull roster and pack
 * deltas in batches, detect/merge conflicts, and record progress, metrics and
 * retry history. Every outbound call is tolerated failing so a school that is
 * offline keeps serving exams.
 */
@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);
  private syncInProgress = false;

  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly outboxRepo: OutboxRepository,
    private readonly packImport: PackImportService,
    private readonly config: SchoolConfigService,
    private readonly http: HttpClient,
    private readonly drizzle: DrizzleSqliteService,
    private readonly scope: SyncScopeService,
    private readonly progressService: SyncProgressService,
    private readonly metricsService: SyncMetricsService,
    private readonly conflictResolution: ConflictResolutionService,
    @Inject(SYNC_RETRY_REPOSITORY) private readonly retryRepo: SyncRetryRepository,
    @Inject(SYNC_ENTITY_VERSION_REPOSITORY)
    private readonly versions: EntityVersionRepository,
  ) {}

  private get db(): ReturnType<DrizzleSqliteService['getDb']> {
    return this.drizzle.getDb();
  }

  /**
   * On startup, close out any sync run that was left `running` by a crash and
   * leave its checkpoints for inspection. Best-effort: a failure here must
   * never stop the server from serving exams.
   */
  async onModuleInit(): Promise<void> {
    try {
      const recovered = await this.recoverInterrupted();
      if (recovered.length > 0) {
        this.logger.warn(`Marked ${recovered.length} interrupted sync run(s) as failed`);
      }
    } catch (error) {
      this.logger.warn(
        `Could not recover interrupted sync runs: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async sync(): Promise<SyncResult> {
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
    const syncId = randomUUID();
    const schoolId = await this.scope.getSchoolId();
    const errors: string[] = [];
    let pushed = 0;
    let pulledRoster = 0;
    let pulledPacks = 0;
    let conflictsDetected = 0;
    let conflictsResolved = 0;
    let bytes = 0;
    const syncStart = Date.now();

    await this.metricsService.start(syncId, schoolId);
    this.progressService.begin(syncId, schoolId);
    this.logger.log(`Starting sync cycle ${syncId} for school '${schoolId}'`);

    try {
      // ── Push pending outbox events ────────────────────────────────────────
      const pushResult = await this.pushOutbox(schoolId);
      pushed = pushResult.pushed;
      bytes += pushResult.bytes;
      errors.push(...pushResult.errors);
      await this.progressService.completePhase(syncId, 'push', {
        processed: pushed,
        total: pushed,
      });

      // ── Pull roster delta (cursor-based) ──────────────────────────────────
      const rosterResult = await this.pullRosterDelta(syncId, schoolId);
      pulledRoster = rosterResult.count;
      conflictsDetected += rosterResult.conflictsDetected;
      conflictsResolved += rosterResult.conflictsResolved;
      bytes += rosterResult.bytes;
      errors.push(...rosterResult.errors);
      await this.progressService.completePhase(syncId, 'pull_roster', {
        processed: pulledRoster,
        total: pulledRoster,
      });

      // ── Pull pack delta ───────────────────────────────────────────────────
      const packResult = await this.pullPacks(syncId, schoolId);
      pulledPacks = packResult.count;
      bytes += packResult.bytes;
      errors.push(...packResult.errors);
      await this.progressService.completePhase(syncId, 'pull_packs', {
        processed: pulledPacks,
        total: pulledPacks,
      });

      // Only advance the delta watermark once the pull phases are done.
      await this.scope.setState('last_sync_at', new Date().toISOString());

      this.logger.log(
        `Sync ${syncId} complete: pushed ${pushed}, pulled roster ${pulledRoster}, pulled packs ${pulledPacks}, ` +
          `conflicts ${conflictsDetected} (resolved ${conflictsResolved}), ${Date.now() - syncStart}ms`,
      );
    } catch (error) {
      this.logger.error('Sync failed', error);
      errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      this.syncInProgress = false;
    }

    const processed = pushed + pulledRoster + pulledPacks;
    const status: SyncRunStatus =
      errors.length === 0 ? 'success' : processed > 0 ? 'partial' : 'failed';

    await this.metricsService.finalize(syncId, {
      pushed,
      pulledRoster,
      pulledPacks,
      errorCount: errors.length,
      conflictsDetected,
      conflictsResolved,
      bytesTransferred: bytes,
      status,
    });
    await this.progressService.finish(syncId, status);

    return { pushed, pulled: { roster: pulledRoster, packs: pulledPacks }, errors };
  }

  async getStatus(): Promise<SyncStatus> {
    const schoolId = await this.scope.getSchoolId();
    const pendingCount = (await this.outboxRepo.countPending?.()) ?? 0;
    const lastSync = await this.scope.getState('last_sync_at');
    return {
      status: this.syncInProgress ? 'running' : 'idle',
      last_sync: lastSync ?? null,
      pending_events: pendingCount,
      school_id: schoolId,
      progress: this.progressService.current(),
    };
  }

  /** Live (and most recent) progress for the status endpoint. */
  getProgress(): SyncProgress | null {
    return this.progressService.current();
  }

  /** Recent recorded metrics, newest first. */
  async getRecentMetrics(limit = 20): Promise<SyncMetricsRecord[]> {
    const schoolId = await this.scope.getSchoolId();
    return this.metricsService.recent(schoolId, limit);
  }

  /** Aggregated sync statistics over a window (task 8). */
  async getAnalytics(days = 30): Promise<SyncAnalytics> {
    const schoolId = await this.scope.getSchoolId();
    return this.metricsService.analytics(schoolId, { days });
  }

  /** Recorded conflicts, newest first (tasks 1 and 6). */
  async getConflicts(
    filter: { status?: 'open' | 'resolved' | 'ignored'; entityType?: SyncEntityType; limit?: number } = {},
  ): Promise<SyncConflictRecord[]> {
    const schoolId = await this.scope.getSchoolId();
    return this.conflictResolution.list({ ...filter, schoolId });
  }

  /** Open conflict count, for the dashboard badge. */
  async openConflictCount(): Promise<number> {
    return this.conflictResolution.openCount(await this.scope.getSchoolId());
  }

  /** Resolve an open conflict with a strategy and apply it locally. */
  async resolveConflict(
    id: string,
    strategy: ConflictStrategy,
    resolvedBy = 'admin',
  ): Promise<SyncConflictRecord | null> {
    const result = await this.conflictResolution.resolveById(id, strategy, resolvedBy);
    if (!result) return null;

    if (result.conflict.entityType === 'student') {
      const view = result.value as StudentView;
      await this.db
        .update(students)
        .set({
          code: view.code,
          codeStatus: view.codeStatus,
          fullName: view.fullName,
          classId: view.classId,
          section: view.section,
          photoPath: view.photoPath,
          syncedAt: new Date().toISOString(),
        })
        .where(eq(students.id, result.conflict.entityId));
    }
    return result.conflict;
  }

  /** Dismiss an open conflict without applying either side. */
  async ignoreConflict(id: string): Promise<boolean> {
    return this.conflictResolution.ignore(id);
  }

  /** Retry attempts for outbox pushes (task 9). */
  async getRetryHistory(limit = 50): Promise<SyncRetryRecord[]> {
    const schoolId = await this.scope.getSchoolId();
    return this.retryRepo.listRecent(schoolId, limit);
  }

  /** Mark interrupted runs failed after a restart (task 5, crash recovery). */
  async recoverInterrupted(): Promise<SyncMetricsRecord[]> {
    const schoolId = await this.scope.getSchoolId();
    return this.metricsService.recoverInterrupted(schoolId);
  }

  /** Checkpoints left non-terminal after a crash, oldest per phase last. */
  async getResumableCheckpoints() {
    const schoolId = await this.scope.getSchoolId();
    return this.progressService.resumable(schoolId);
  }

  /**
   * Note that an entity was changed locally so the next sync treats it as a
   * local edit (and therefore a candidate for conflict/merge).
   */
  async noteLocalChange(
    entityType: SyncEntityType,
    entityId: string,
    now = new Date().toISOString(),
  ): Promise<void> {
    const schoolId = await this.scope.getSchoolId();
    const existing = await this.versions.get(schoolId, entityType, entityId);
    await this.versions.upsert({
      schoolId,
      entityType,
      entityId,
      localVersion: (existing?.localVersion ?? 0) + 1,
      remoteVersion: existing?.remoteVersion ?? 0,
      baseVersion: existing?.baseVersion ?? 0,
      baseValue: existing?.baseValue ?? null,
      localUpdatedAt: now,
      remoteUpdatedAt: existing?.remoteUpdatedAt ?? null,
      lastSyncedAt: existing?.lastSyncedAt ?? null,
    });
  }

  private async pushOutbox(
    schoolId: string,
  ): Promise<{ pushed: number; errors: string[]; bytes: number }> {
    const errors: string[] = [];
    let pushed = 0;
    let bytes = 0;

    try {
      const cloudUrl = this.config.cloudSyncUrl;
      if (!cloudUrl) {
        return { pushed, errors: ['Cloud sync URL not configured'], bytes };
      }

      const now = new Date().toISOString();
      const pending = await this.outboxRepo.listPending(now);
      if (pending.length === 0) {
        this.logger.debug('No pending outbox events to push');
        return { pushed, errors, bytes };
      }

      const eventsByType = this.groupEventsByType(pending);

      for (const [type, events] of Object.entries(eventsByType)) {
        for (const batch of chunk(events, SYNC_BATCH_SIZE)) {
          const eventIds = batch.map((event) => event.eventId);
          try {
            const response = await this.http.post(`${cloudUrl}/sync/v1/results`, {
              type,
              events: batch.map((event) => ({
                event_id: event.eventId,
                payload: event.payload,
                created_at: event.createdAt,
              })),
            });
            bytes += Buffer.byteLength(JSON.stringify(batch));

            if (response.ok) {
              await this.outboxRepo.acknowledge(eventIds, now);
              pushed += eventIds.length;
            } else {
              await this.recordRetry(batch, schoolId, response.error ?? 'Unknown error', now);
              errors.push(`Failed to push ${type} events: ${response.error}`);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.recordRetry(batch, schoolId, message, now);
            this.logger.error(`Failed to push ${type} events`, error);
            errors.push(`Failed to push ${type} events: ${message}`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Push outbox failed', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return { pushed, errors, bytes };
  }

  private async recordRetry(
    events: Array<{ eventId: string; attempts?: number }>,
    schoolId: string,
    errorMsg: string,
    attemptedAt: string,
  ): Promise<void> {
    const nextAttemptAt = new Date(
      Date.now() + this.calculateRetryDelay(events[0]?.attempts ?? 0),
    ).toISOString();
    await this.outboxRepo.incrementAttempts(
      events.map((event) => event.eventId),
      nextAttemptAt,
      errorMsg,
    );
    for (const event of events) {
      await this.retryRepo.insert({
        eventId: event.eventId,
        schoolId,
        attempt: (event.attempts ?? 0) + 1,
        errorMsg,
        attemptedAt,
        nextAttemptAt,
      });
    }
  }

  private async pullRosterDelta(
    syncId: string,
    schoolId: string,
  ): Promise<{ count: number; errors: string[] } & PullCounters> {
    const errors: string[] = [];
    let count = 0;
    const counters: PullCounters = { conflictsDetected: 0, conflictsResolved: 0, bytes: 0 };

    try {
      const cloudUrl = this.config.cloudSyncUrl;
      if (!cloudUrl) {
        return { count, errors: ['Cloud sync URL not configured'], ...counters };
      }

      const since = await this.scope.getState('roster_cursor');
      const response = await this.http.get<RosterResponse>(
        `${cloudUrl}/sync/v1/roster?since=${since ?? ''}`,
      );

      if (!response.ok || !response.data || !Array.isArray(response.data.students)) {
        return { count, errors: [`Failed to pull roster delta: ${response.error}`], ...counters };
      }

      const studentsData = response.data.students;
      counters.bytes += Buffer.byteLength(JSON.stringify(studentsData));
      const cursor = response.data.cursor;

      await processInBatches(
        studentsData,
        async (student) => {
          await this.applyRemoteStudent(student, schoolId, counters);
        },
        {
          batchSize: SYNC_BATCH_SIZE,
          onProgress: async (progress) => {
            await this.progressService.report(syncId, {
              phase: 'pull_roster',
              processed: progress.processed,
              total: progress.total,
              cursor,
            });
          },
        },
      );

      count = studentsData.length;
      if (cursor) await this.scope.setState('roster_cursor', cursor);
      this.logger.debug(`Pulled ${count} roster updates (delta since ${since ?? 'never'})`);
    } catch (error) {
      this.logger.error('Pull roster delta failed', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return { count, errors, ...counters };
  }

  /** Apply one remote student, merging or flagging conflicts (tasks 1, 6, 7). */
  private async applyRemoteStudent(
    student: RemoteStudent,
    schoolId: string,
    counters: PullCounters,
  ): Promise<void> {
    const now = new Date().toISOString();
    const remoteView: StudentView = {
      code: student.code,
      codeStatus: student.codeStatus,
      fullName: student.fullName,
      classId: student.classId,
      section: student.section,
      photoPath: student.photoPath,
    };

    const rows = await this.db
      .select()
      .from(students)
      .where(eq(students.id, student.id))
      .limit(1);
    const existing = rows[0];

    if (!existing) {
      await this.insertStudent(student.id, remoteView, now);
      const version = student.version ?? 1;
      await this.versions.upsert({
        schoolId,
        entityType: 'student',
        entityId: student.id,
        localVersion: version,
        remoteVersion: version,
        baseVersion: version,
        baseValue: remoteView,
        localUpdatedAt: student.updated_at ?? student.syncedAt,
        remoteUpdatedAt: student.updated_at ?? student.syncedAt,
        lastSyncedAt: now,
      });
      return;
    }

    const localView: StudentView = {
      code: existing.code,
      codeStatus: existing.codeStatus,
      fullName: existing.fullName,
      classId: existing.classId,
      section: existing.section,
      photoPath: existing.photoPath,
    };

    const versionRecord = await this.versions.get(schoolId, 'student', student.id);
    const localVersion = versionRecord?.localVersion ?? 1;
    const baseVersion = versionRecord?.baseVersion ?? localVersion;
    const remoteVersion = student.version ?? baseVersion + 1;

    const outcome = await this.conflictResolution.detectAndResolve<StudentView>({
      schoolId,
      entityType: 'student',
      entityId: student.id,
      base: (versionRecord?.baseValue as Partial<StudentView> | null) ?? null,
      local: localView,
      remote: remoteView,
      localVersion,
      remoteVersion,
      baseVersion,
      localUpdatedAt: versionRecord?.localUpdatedAt ?? existing.syncedAt,
      remoteUpdatedAt: student.updated_at ?? student.syncedAt,
      strategy: 'merge',
    });

    if (outcome.detected) {
      counters.conflictsDetected++;
      if (outcome.resolved) counters.conflictsResolved++;
    }

    await this.insertStudent(student.id, outcome.value, now);
  }

  private async insertStudent(id: string, view: StudentView, syncedAt: string): Promise<void> {
    await this.db
      .insert(students)
      .values({
        id,
        code: view.code,
        codeStatus: view.codeStatus,
        fullName: view.fullName,
        classId: view.classId,
        section: view.section,
        photoPath: view.photoPath,
        syncedAt,
      })
      .onConflictDoUpdate({
        target: students.id,
        set: {
          code: view.code,
          codeStatus: view.codeStatus,
          fullName: view.fullName,
          classId: view.classId,
          section: view.section,
          photoPath: view.photoPath,
          syncedAt,
        },
      });
  }

  private async pullPacks(
    syncId: string,
    schoolId: string,
  ): Promise<{ count: number; errors: string[]; bytes: number }> {
    const errors: string[] = [];
    let count = 0;
    let bytes = 0;

    try {
      const cloudUrl = this.config.cloudSyncUrl;
      if (!cloudUrl) {
        return { count, errors: ['Cloud sync URL not configured'], bytes };
      }

      const cursor = await this.scope.getState('pack_cursor');
      const response = await this.http.get<PacksResponse>(
        `${cloudUrl}/sync/v1/packs?since=${cursor ?? ''}`,
      );

      if (!response.ok || !response.data) {
        return { count, errors: [`Failed to pull packs: ${response.error}`], bytes };
      }

      const packList = response.data.packs ?? [];
      bytes += Buffer.byteLength(JSON.stringify(packList));

      await processInBatches(
        packList,
        async (packData) => {
          try {
            const packKey = Buffer.from(packData.pack_key, 'base64');
            const packBytes = Buffer.from(packData.pack_bytes, 'base64');
            await this.packImport.importPack({ bytes: packBytes, packKey });
            count++;
          } catch (error) {
            this.logger.error(`Failed to import pack ${packData.pack_id}`, error);
            errors.push(
              `Failed to import pack ${packData.pack_id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
        {
          batchSize: SYNC_BATCH_SIZE,
          onProgress: async (progress) => {
            await this.progressService.report(syncId, {
              phase: 'pull_packs',
              processed: progress.processed,
              total: progress.total,
            });
          },
        },
      );

      const newCursor = response.data.cursor ?? new Date().toISOString();
      await this.scope.setState('pack_cursor', newCursor);
      this.logger.debug(`Pulled ${count} pack updates`);
    } catch (error) {
      this.logger.error('Pull packs failed', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return { count, errors, bytes };
  }

  private groupEventsByType<T extends { type: string }>(events: T[]): Record<string, T[]> {
    return events.reduce(
      (acc, event) => {
        (acc[event.type] ??= []).push(event);
        return acc;
      },
      {} as Record<string, T[]>,
    );
  }

  private calculateRetryDelay(attempt: number): number {
    const delays = [1000, 2000, 4000, 8000, 16000, 32000, 60000];
    const index = Math.min(attempt, delays.length - 1);
    return delays[index] ?? 60000;
  }

  private groupByType(events: Array<{ type: string }>): Record<string, number> {
    return events.reduce(
      (acc, event) => {
        acc[event.type] = (acc[event.type] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  /** Get comprehensive offline readiness status. */
  async getOfflineStatus(): Promise<{
    offlineMode: boolean;
    syncDisabled: boolean;
    lastSyncAt: string;
    pendingOutboxEvents: number;
    pendingOutboxByType: Record<string, number>;
    rosterCursor: string;
    packCursor: string;
    cloudSyncUrl: string | undefined;
    schoolId: string;
    openConflicts: number;
  }> {
    const offlineMode = this.config.isOfflineMode();
    const syncState = await this.getSyncStateDetails();
    const pendingEvents = await this.getPendingOutboxEvents();
    const schoolId = await this.scope.getSchoolId();
    const openConflicts = await this.conflictResolution.openCount(schoolId);

    return {
      offlineMode,
      syncDisabled: offlineMode,
      lastSyncAt: syncState.lastSyncAt,
      pendingOutboxEvents: pendingEvents.length,
      pendingOutboxByType: this.groupByType(pendingEvents),
      rosterCursor: syncState.rosterCursor,
      packCursor: syncState.packCursor,
      cloudSyncUrl: this.config.cloudSyncUrl,
      schoolId,
      openConflicts,
    };
  }

  /** Get pending outbox events for health check. */
  async getPendingOutboxEvents(): Promise<
    Array<{ eventId: string; type: string; payload: unknown; createdAt: string }>
  > {
    const now = new Date().toISOString();
    return this.outboxRepo.listPending(now);
  }

  /** Get detailed sync state for health check. */
  async getSyncStateDetails(): Promise<{
    rosterCursor: string;
    packCursor: string;
    lastSyncAt: string;
  }> {
    const rosterCursor = (await this.scope.getState('roster_cursor')) ?? 'never';
    const packCursor = (await this.scope.getState('pack_cursor')) ?? 'never';
    const lastSyncAt = (await this.scope.getState('last_sync_at')) ?? 'never';
    return { rosterCursor, packCursor, lastSyncAt };
  }
}
