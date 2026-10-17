import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { DatabaseModule } from '../../shared/database/database.module';
import { DrizzleService } from '../../shared/database/drizzle.service';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { DrizzleNotificationRepository } from './repositories/drizzle-notification.repository';
import {
  InMemoryNotificationRepository,
  NOTIFICATION_REPOSITORY,
} from './repositories/notification.repository';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Notification queue and log (API spec 11.2). Releases enqueue messages here;
 * the transport itself is simulated. Repositories use Drizzle when
 * DATABASE_URL is configured, otherwise in-memory implementations.
 */
@Module({
  imports: [DatabaseModule.register(), AuthModule, SettingsModule],
  controllers: [NotificationsController],
  providers: [
    {
      provide: NOTIFICATION_REPOSITORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) =>
        config.get('DATABASE_URL')
          ? new DrizzleNotificationRepository(drizzle)
          : new InMemoryNotificationRepository(),
      inject: [ConfigService, DrizzleService],
    },
    NotificationsService,
  ],
  exports: [NotificationsService, NOTIFICATION_REPOSITORY],
})
export class NotificationsModule {}
