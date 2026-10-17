import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { HttpClient } from './http-client';
import { SyncScopeService } from './sync-scope.service';
import { SyncProgressService } from './sync-progress.service';
import { SyncMetricsService } from './sync-metrics.service';
import { ConflictResolutionService } from './conflict-resolution.service';
import { SyncController } from './sync.controller';
import { DrizzleSqliteService } from '../../shared/database/drizzle-sqlite.service';
import { META_REPOSITORY } from '../exam/repositories/meta.repository';
import { DrizzleMetaRepository } from '../exam/repositories/drizzle-meta.repository';
import { OUTBOX_REPOSITORY } from '../exam/repositories/outbox.repository';
import { DrizzleOutboxRepository } from '../exam/repositories/drizzle-outbox.repository';
import { SYNC_STATE_REPOSITORY } from './repositories/sync-state.repository';
import { DrizzleSyncStateRepository } from './repositories/drizzle-sync-state.repository';
import { SYNC_CONFLICT_REPOSITORY } from './repositories/conflict.repository';
import { DrizzleSyncConflictRepository } from './repositories/drizzle-conflict.repository';
import { SYNC_ENTITY_VERSION_REPOSITORY } from './repositories/entity-version.repository';
import { DrizzleEntityVersionRepository } from './repositories/drizzle-entity-version.repository';
import { SYNC_METRICS_REPOSITORY } from './repositories/sync-metrics.repository';
import { DrizzleSyncMetricsRepository } from './repositories/drizzle-sync-metrics.repository';
import { SYNC_CHECKPOINT_REPOSITORY } from './repositories/sync-checkpoint.repository';
import { DrizzleSyncCheckpointRepository } from './repositories/drizzle-sync-checkpoint.repository';
import { SYNC_RETRY_REPOSITORY } from './repositories/sync-retry.repository';
import { DrizzleSyncRetryRepository } from './repositories/drizzle-sync-retry.repository';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { ExamModule } from '../exam/exam.module';

/**
 * Sync agent module (Phase 7/8). Beyond the push/pull cycle it owns the Phase 8
 * bookkeeping: conflict resolution, per-sync metrics, resumable checkpoints,
 * retry history and cross-school scoping.
 */
@Module({
  imports: [ExamModule],
  controllers: [SyncController],
  providers: [
    SyncService,
    HttpClient,
    SyncScopeService,
    SyncProgressService,
    SyncMetricsService,
    ConflictResolutionService,
    { provide: META_REPOSITORY, useClass: DrizzleMetaRepository },
    { provide: OUTBOX_REPOSITORY, useClass: DrizzleOutboxRepository },
    { provide: SYNC_STATE_REPOSITORY, useClass: DrizzleSyncStateRepository },
    { provide: SYNC_CONFLICT_REPOSITORY, useClass: DrizzleSyncConflictRepository },
    { provide: SYNC_ENTITY_VERSION_REPOSITORY, useClass: DrizzleEntityVersionRepository },
    { provide: SYNC_METRICS_REPOSITORY, useClass: DrizzleSyncMetricsRepository },
    { provide: SYNC_CHECKPOINT_REPOSITORY, useClass: DrizzleSyncCheckpointRepository },
    { provide: SYNC_RETRY_REPOSITORY, useClass: DrizzleSyncRetryRepository },
    SchoolConfigService,
    DrizzleSqliteService,
  ],
  exports: [SyncService],
})
export class SyncModule {}
