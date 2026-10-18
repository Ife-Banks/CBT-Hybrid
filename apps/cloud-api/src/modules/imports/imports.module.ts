import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { DatabaseModule } from '../../shared/database/database.module';
import { DrizzleService } from '../../shared/database/drizzle.service';
import { AuthModule } from '../auth/auth.module';
import { DrizzleImportRepository } from './drizzle-imports.repository';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { IMPORT_REPOSITORY, InMemoryImportRepository } from './imports.repository';

/**
 * Import pipeline (API spec section 7). Uses Drizzle when DATABASE_URL is
 * configured, otherwise the in-memory repository.
 */
@Module({
  imports: [DatabaseModule.register(), AuthModule],
  controllers: [ImportsController],
  providers: [
    {
      provide: IMPORT_REPOSITORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) =>
        config.get('DATABASE_URL')
          ? new DrizzleImportRepository(drizzle)
          : new InMemoryImportRepository(),
      inject: [ConfigService, DrizzleService],
    },
    ImportsService,
  ],
  exports: [ImportsService],
})
export class ImportsModule {}
