import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { DatabaseModule } from '../../shared/database/database.module';
import { DrizzleService } from '../../shared/database/drizzle.service';
import { AuthModule } from '../auth/auth.module';
import { ExamsModule } from '../exams/exams.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { ExamKeyCorrectionsController } from './exam-key-corrections.controller';
import { GradeScaleController } from './grade-scale.controller';
import { GradeScaleService } from './grade-scale.service';
import { ReportsController } from './reports.controller';
import { ResultsController } from './results.controller';
import { ResultsIntakeService } from './results-intake.service';
import { ResultsService } from './results.service';
import {
  DrizzleDirectoryRepository,
  DrizzleGradeScaleRepository,
  DrizzleKeyCorrectionStore,
  DrizzleRemarkRunRepository,
  DrizzleResultRepository,
  DrizzleSubmissionRepository,
  GRADE_SCALE_REPOSITORY,
  InMemoryDirectoryRepository,
  InMemoryGradeScaleRepository,
  InMemoryKeyCorrectionStore,
  InMemoryRemarkRunRepository,
  InMemoryResultRepository,
  InMemorySubmissionRepository,
  KEY_CORRECTION_STORE,
  REMARK_RUN_REPOSITORY,
  RESULT_REPOSITORY,
  RESULTS_DIRECTORY,
  SUBMISSION_REPOSITORY,
} from './repositories';

/**
 * Results processing: marking, review, release, re-marking, reports and the
 * directory read-model the analytics and parent modules share. Repositories use
 * Drizzle when DATABASE_URL is configured, otherwise in-memory implementations.
 */
@Module({
  imports: [DatabaseModule.register(), AuthModule, NotificationsModule, SettingsModule, ExamsModule],
  controllers: [
    ResultsController,
    ExamKeyCorrectionsController,
    GradeScaleController,
    ReportsController,
  ],
  providers: [
    {
      provide: GRADE_SCALE_REPOSITORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) =>
        config.get('DATABASE_URL')
          ? new DrizzleGradeScaleRepository(drizzle)
          : new InMemoryGradeScaleRepository(),
      inject: [ConfigService, DrizzleService],
    },
    {
      provide: SUBMISSION_REPOSITORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) =>
        config.get('DATABASE_URL')
          ? new DrizzleSubmissionRepository(drizzle)
          : new InMemorySubmissionRepository(),
      inject: [ConfigService, DrizzleService],
    },
    {
      provide: RESULT_REPOSITORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) =>
        config.get('DATABASE_URL')
          ? new DrizzleResultRepository(drizzle)
          : new InMemoryResultRepository(),
      inject: [ConfigService, DrizzleService],
    },
    {
      provide: REMARK_RUN_REPOSITORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) =>
        config.get('DATABASE_URL')
          ? new DrizzleRemarkRunRepository(drizzle)
          : new InMemoryRemarkRunRepository(),
      inject: [ConfigService, DrizzleService],
    },
    {
      provide: RESULTS_DIRECTORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) =>
        config.get('DATABASE_URL')
          ? new DrizzleDirectoryRepository(drizzle)
          : new InMemoryDirectoryRepository(),
      inject: [ConfigService, DrizzleService],
    },
    {
      provide: KEY_CORRECTION_STORE,
      useFactory: (config: ConfigService, drizzle: DrizzleService) =>
        config.get('DATABASE_URL')
          ? new DrizzleKeyCorrectionStore(drizzle)
          : new InMemoryKeyCorrectionStore(),
      inject: [ConfigService, DrizzleService],
    },
    GradeScaleService,
    ResultsService,
    ResultsIntakeService,
  ],
  exports: [
    GRADE_SCALE_REPOSITORY,
    SUBMISSION_REPOSITORY,
    RESULT_REPOSITORY,
    REMARK_RUN_REPOSITORY,
    RESULTS_DIRECTORY,
    KEY_CORRECTION_STORE,
    GradeScaleService,
    ResultsService,
    ResultsIntakeService,
  ],
})
export class ResultsModule {}
