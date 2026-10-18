import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { SchoolConfigModule } from './common/config/school-config.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ExamModule } from './modules/exam/exam.module';
import { ConsoleModule } from './modules/console/console.module';
import { SyncModule } from './modules/sync/sync.module';
import { HealthModule } from './modules/health/health.module';
import { DatabaseModule } from './shared/database/database.module';
import { LoggerModule } from './shared/logger/logger.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    LoggerModule,
    SchoolConfigModule,
    DatabaseModule,
    ExamModule,      // Must be before HealthModule (which imports SyncModule -> ExamModule)
    HealthModule,
    ConsoleModule,
    SyncModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
