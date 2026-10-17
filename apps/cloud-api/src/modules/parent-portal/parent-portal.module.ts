import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { DatabaseModule } from '../../shared/database/database.module';
import { DrizzleService } from '../../shared/database/drizzle.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ResultsModule } from '../results/results.module';
import { DrizzleParentAccountRepository } from './drizzle-parent-account.repository';
import { GUARDIAN_NOTIFIER, LoggingGuardianNotifier } from './guardian-notifier';
import { ParentAccountService } from './parent-account.service';
import { ParentPortalController } from './parent-portal.controller';
import { ParentPortalService } from './parent-portal.service';
import {
  InMemoryParentAccountRepository,
  PARENT_ACCOUNT_REPOSITORY,
} from './parent-account.repository';

/** Parent portal reads and account management (API spec section 10). */
@Module({
  imports: [DatabaseModule.register(), AuthModule, ResultsModule, AnalyticsModule, NotificationsModule],
  controllers: [ParentPortalController],
  providers: [
    {
      provide: PARENT_ACCOUNT_REPOSITORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) =>
        config.get('DATABASE_URL')
          ? new DrizzleParentAccountRepository(drizzle)
          : new InMemoryParentAccountRepository(),
      inject: [ConfigService, DrizzleService],
    },
    { provide: GUARDIAN_NOTIFIER, useClass: LoggingGuardianNotifier },
    ParentPortalService,
    ParentAccountService,
  ],
  exports: [ParentPortalService, ParentAccountService],
})
export class ParentPortalModule {}
