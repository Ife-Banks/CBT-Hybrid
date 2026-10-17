import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { DatabaseModule } from '../../shared/database/database.module';
import { DrizzleService } from '../../shared/database/drizzle.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { DrizzleExportRepository } from './repositories/drizzle-export.repository';
import { EXPORT_REPOSITORY, InMemoryExportRepository } from './repositories/export.repository';

/**
 * School data exports (API spec 11.4, US-14.3). The repository reads the
 * students/guardians/invitations tables via Drizzle when DATABASE_URL is set,
 * and an in-memory source otherwise.
 */
@Module({
  imports: [DatabaseModule.register(), AuthModule, NotificationsModule],
  controllers: [ExportsController],
  providers: [
    {
      provide: EXPORT_REPOSITORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) =>
        config.get('DATABASE_URL')
          ? new DrizzleExportRepository(drizzle)
          : new InMemoryExportRepository(),
      inject: [ConfigService, DrizzleService],
    },
    ExportsService,
  ],
})
export class ExportsModule {}
