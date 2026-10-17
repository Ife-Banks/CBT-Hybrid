import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from './common/config/config.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { UsersModule } from './modules/users/users.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { ExamsModule } from './modules/exams/exams.module';
import { SyncModule } from './modules/sync/sync.module';
import { ResultsModule } from './modules/results/results.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ParentPortalModule } from './modules/parent-portal/parent-portal.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ExportsModule } from './modules/exports/exports.module';
import { HealthModule } from './modules/health/health.module';
import { LoggerModule } from './shared/logger/logger.module';

@Module({
  imports: [
    LoggerModule,
    ConfigModule,
    IdempotencyModule,
    HealthModule,
    AuthModule,
    UsersModule,
    QuestionsModule,
    ExamsModule,
    NotificationsModule,
    SettingsModule,
    ResultsModule,
    AnalyticsModule,
    ParentPortalModule,
    SyncModule,
    AuditModule,
    ExportsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
