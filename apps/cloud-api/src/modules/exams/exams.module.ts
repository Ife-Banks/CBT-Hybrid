import { Module } from '@nestjs/common';
import {
  DrizzleClassRepository,
  DrizzleExamPackRepository,
  DrizzleExamRepository,
  DrizzlePackSourceRepository,
  DrizzleSittingRepository,
} from './repositories';
import { ExamsService } from './exams.service';
import { ExamBuilderService } from './exam-builder.service';
import { ExamSchedulerService } from './exam-scheduler.service';
import { ExamPackService } from './exam-pack.service';
import { LocalPackStore, PackStore } from './pack-store';
import { ExamsController } from './exams.controller';
import { PacksController } from './packs.controller';
import { DatabaseModule } from '../../shared/database/database.module';
import { AuthModule } from '../auth/auth.module';

const databaseUrl = process.env.DATABASE_URL;

@Module({
  // AuthModule supplies the exported AuditService and the guards' dependencies
  // (SessionService, USER_REPOSITORY, AbilityFactory) used by the controllers.
  imports: databaseUrl ? [DatabaseModule, AuthModule] : [],
  controllers: databaseUrl ? [ExamsController, PacksController] : [],
  providers: databaseUrl
    ? [
        DrizzleClassRepository,
        DrizzleExamRepository,
        DrizzleSittingRepository,
        DrizzleExamPackRepository,
        DrizzlePackSourceRepository,
        { provide: PackStore, useClass: LocalPackStore },
        ExamsService,
        ExamBuilderService,
        ExamSchedulerService,
        ExamPackService,
      ]
    : [],
  exports: databaseUrl
    ? [ExamsService, ExamBuilderService, ExamSchedulerService, ExamPackService]
    : [],
})
export class ExamsModule {}
