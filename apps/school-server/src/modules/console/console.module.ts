import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { ConsoleController } from './console.controller';
import { ConsoleService } from './console.service';
import {
  CATALOG_REPOSITORY,
  DrizzleCatalogRepository,
  META_REPOSITORY,
  DrizzleMetaRepository,
} from '../exam/repositories';

/**
 * Invigilator Console API (API spec section 17).
 * Provides PIN sign-in, overview/readiness dashboard, and sitting management.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [ConsoleController],
  providers: [
    ConsoleService,
    { provide: CATALOG_REPOSITORY, useClass: DrizzleCatalogRepository },
    { provide: META_REPOSITORY, useClass: DrizzleMetaRepository },
  ],
  exports: [ConsoleService],
})
export class ConsoleModule {}
