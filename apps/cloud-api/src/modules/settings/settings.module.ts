import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { DatabaseModule } from '../../shared/database/database.module';
import { DrizzleService } from '../../shared/database/drizzle.service';
import { AuthModule } from '../auth/auth.module';
import { DrizzleSchoolSettingsRepository } from './drizzle-settings.repository';
import { SettingsController } from './settings.controller';
import {
  InMemorySchoolSettingsRepository,
  SCHOOL_SETTINGS_REPOSITORY,
} from './settings.repository';
import { SettingsService } from './settings.service';

/**
 * School settings (API spec 11.3). Reads and writes `schools.settings` and is
 * shared by the results (release policy, notify-on-remark) and notifications
 * (paid-channel gating) modules. Repositories use Drizzle when DATABASE_URL is
 * configured, otherwise in-memory implementations.
 */
@Module({
  imports: [DatabaseModule.register(), AuthModule],
  controllers: [SettingsController],
  providers: [
    {
      provide: SCHOOL_SETTINGS_REPOSITORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) =>
        config.get('DATABASE_URL')
          ? new DrizzleSchoolSettingsRepository(drizzle)
          : new InMemorySchoolSettingsRepository(),
      inject: [ConfigService, DrizzleService],
    },
    SettingsService,
  ],
  exports: [SettingsService, SCHOOL_SETTINGS_REPOSITORY],
})
export class SettingsModule {}
