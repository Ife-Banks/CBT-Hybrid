import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { requireSchool } from '../../common/request-context';
import { CheckAbilities } from '../auth/decorators/check-abilities.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthContext } from '../auth/domain/types';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { keyCorrectionSchema } from './dto/results.dto';
import { ResultsService } from './results.service';

/**
 * Correct an answer key and re-mark stored submissions (API spec 9.3). Nothing
 * changes until `apply`; previews are persisted as remark runs.
 */
@Controller('exams')
@UseGuards(AuthGuard, AbilitiesGuard)
export class ExamKeyCorrectionsController {
  constructor(private readonly results: ResultsService) {}

  @Post(':examId/key-corrections')
  @CheckAbilities({ action: 'update', subject: 'Exam' })
  async preview(
    @CurrentAuth() auth: AuthContext,
    @Param('examId') examId: string,
    @Body() body: unknown,
  ) {
    const schoolId = requireSchool(auth);
    const dto = keyCorrectionSchema.parse(body);
    return this.results.previewKeyCorrection(schoolId, auth.user.id, {
      examId,
      questionId: dto.question_id,
      correctOptionIds: dto.correct_option_ids,
      fillAnswers: dto.fill_answers,
      caseSensitive: dto.case_sensitive,
      reason: dto.reason,
    });
  }

  @Get(':examId/key-corrections/:runId')
  @CheckAbilities({ action: 'read', subject: 'Exam' })
  async get(@CurrentAuth() auth: AuthContext, @Param('runId') runId: string) {
    const schoolId = requireSchool(auth);
    return this.results.getKeyCorrection(schoolId, runId);
  }

  @Post(':examId/key-corrections/:runId/apply')
  @CheckAbilities({ action: 'update', subject: 'Exam' })
  async apply(@CurrentAuth() auth: AuthContext, @Param('runId') runId: string) {
    const schoolId = requireSchool(auth);
    return this.results.applyKeyCorrection(schoolId, auth.user.id, runId);
  }

  @Post(':examId/key-corrections/:runId/cancel')
  @CheckAbilities({ action: 'update', subject: 'Exam' })
  async cancel(@CurrentAuth() auth: AuthContext, @Param('runId') runId: string) {
    const schoolId = requireSchool(auth);
    return this.results.cancelKeyCorrection(schoolId, runId);
  }
}
