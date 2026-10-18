import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import {
  CATALOG_REPOSITORY,
  DrizzleCatalogRepository,
  DrizzleMetaRepository,
  META_REPOSITORY,
} from '../exam/repositories';
import { ELEVATION_RUNNER, ElevatingProcessRunner } from '../../common/process/elevation.runner';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BACKUP_REPOSITORY } from './backup.repository';
import { DrizzleBackupRepository } from './drizzle-backup.repository';

/**
 * Backups and restores (CBT-04 section 6.6, US-15.4 and US-15.5): the sitting
 * and nightly backups, the second backup location and the guarded restore that
 * hands off to the elevated helper.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [BackupController],
  providers: [
    BackupService,
    { provide: BACKUP_REPOSITORY, useClass: DrizzleBackupRepository },
    { provide: META_REPOSITORY, useClass: DrizzleMetaRepository },
    { provide: CATALOG_REPOSITORY, useClass: DrizzleCatalogRepository },
    { provide: ELEVATION_RUNNER, useClass: ElevatingProcessRunner },
  ],
  exports: [BackupService],
})
export class BackupModule {}
