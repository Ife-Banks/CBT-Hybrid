import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { SyncModule } from '../sync/sync.module';
import { BackupModule } from '../backup/backup.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DatabaseModule, SyncModule, BackupModule],
  controllers: [HealthController],
})
export class HealthModule {}