import { Module } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { QuestionsController } from './questions.controller';
import { DrizzleSubjectRepository } from './repositories/drizzle-subject.repository';
import { DrizzleLevelRepository } from './repositories/drizzle-level.repository';
import { DrizzleQuestionRepository } from './repositories/drizzle-question.repository';
import { DrizzleAssetRepository } from './repositories/drizzle-asset.repository';
import { DrizzleQuestionAssetRepository } from './repositories/drizzle-question-asset.repository';
import { DrizzleImportJobRepository } from './repositories/drizzle-import-job.repository';
import { DatabaseModule } from '../../shared/database/database.module';
import { AuditService } from '../auth/audit/audit.service';

// Conditional module: only include Drizzle repositories when DATABASE_URL is set
@Module({
  imports: [
    ...(process.env.DATABASE_URL ? [DatabaseModule] : []),
  ],
  controllers: process.env.DATABASE_URL ? [QuestionsController] : [],
  providers: [
    ...(process.env.DATABASE_URL ? [QuestionsService, AuditService] : []),
    ...(process.env.DATABASE_URL
      ? [
          DrizzleSubjectRepository,
          DrizzleLevelRepository,
          DrizzleQuestionRepository,
          DrizzleAssetRepository,
          DrizzleQuestionAssetRepository,
          DrizzleImportJobRepository,
        ]
      : []),
  ],
  exports: process.env.DATABASE_URL ? [QuestionsService] : [],
})
export class QuestionsModule {}
