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
import { AuditService } from '../auth/audit/audit.service';

const databaseUrl = process.env.DATABASE_URL;

@Module({
  imports: databaseUrl ? [DatabaseModule] : [],
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
        AuditService,
      ]
    : [],
  exports: databaseUrl
    ? [ExamsService, ExamBuilderService, ExamSchedulerService, ExamPackService]
    : [],
})
export class ExamsModule {}
