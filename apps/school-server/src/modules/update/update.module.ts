import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { BackupModule } from '../backup/backup.module';
import { DrizzleCatalogRepository } from '../exam/repositories/drizzle-catalog.repository';
import { DrizzleMetaRepository } from '../exam/repositories/drizzle-meta.repository';
import { CATALOG_REPOSITORY } from '../exam/repositories/catalog.repository';
import { META_REPOSITORY } from '../exam/repositories/meta.repository';
import { UpdateController } from './update.controller';
import { UPDATE_HTTP, UpdateService } from './update.service';
import { UPDATER_RUNNER, ElevatingUpdaterRunner } from './updater.runner';

/**
 * In-app update with rollback (CBT-04 section 6.4): heartbeat offer, verified
 * download and the guarded apply that hands off to the elevated updater.
 */
@Module({
  imports: [DatabaseModule, BackupModule],
  controllers: [UpdateController],
  providers: [
    UpdateService,
    { provide: META_REPOSITORY, useClass: DrizzleMetaRepository },
    { provide: CATALOG_REPOSITORY, useClass: DrizzleCatalogRepository },
    { provide: UPDATER_RUNNER, useClass: ElevatingUpdaterRunner },
    { provide: UPDATE_HTTP, useValue: globalThis.fetch.bind(globalThis) },
  ],
  exports: [UpdateService],
})
export class UpdateModule {}
