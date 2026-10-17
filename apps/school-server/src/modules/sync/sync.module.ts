import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { HttpClient } from './http-client';
import { DrizzleSqliteService } from '../../shared/database/drizzle-sqlite.service';
import { OUTBOX_REPOSITORY } from '../exam/repositories/outbox.repository';
import { DrizzleOutboxRepository } from '../exam/repositories/drizzle-outbox.repository';
import { SYNC_STATE_REPOSITORY } from './repositories/sync-state.repository';
import { DrizzleSyncStateRepository } from './repositories/drizzle-sync-state.repository';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { ExamModule } from '../exam/exam.module';

@Module({
  imports: [ExamModule],
  providers: [
    SyncService,
    HttpClient,
    { provide: OUTBOX_REPOSITORY, useClass: DrizzleOutboxRepository },
    { provide: SYNC_STATE_REPOSITORY, useClass: DrizzleSyncStateRepository },
    SchoolConfigService,
    DrizzleSqliteService,
  ],
  exports: [SyncService],
})
export class SyncModule {}