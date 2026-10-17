import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { requireSchool } from '../../common/request-context';
import { CheckAbilities } from '../auth/decorators/check-abilities.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthContext } from '../auth/domain/types';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import {
  manualMarkSchema,
  releaseResultsSchema,
  resultListQuerySchema,
  reviewResultsSchema,
  withdrawResultsSchema,
} from './dto/results.dto';
import { ResultsService } from './results.service';

/**
 * Results review and release (API spec section 9). Marking happens when results
 * sync up; these routes let a teacher or admin review, release, withdraw and
 * hand-mark answers.
 */
@Controller('results')
@UseGuards(AuthGuard, AbilitiesGuard)
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get()
  @CheckAbilities({ action: 'read', subject: 'Result' })
  async list(@CurrentAuth() auth: AuthContext, @Query() query: Record<string, string>) {
    const schoolId = requireSchool(auth);
    const parsed = resultListQuerySchema.parse(query);
    const page = await this.results.list(
      schoolId,
      {
        examId: parsed.exam_id,
        classId: parsed.class_id,
        status: parsed.status,
        studentId: parsed.student_id,
      },
      { cursor: parsed.cursor, limit: parsed.limit },
    );
    return {
      data: page.data,
      next_cursor: page.nextCursor,
      last_synced_at: page.lastSyncedAt,
    };
  }

  @Get(':id')
  @CheckAbilities({ action: 'read', subject: 'Result' })
  async detail(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    const schoolId = requireSchool(auth);
    return this.results.getDetail(schoolId, id);
  }

  @Post('review')
  @CheckAbilities({ action: 'update', subject: 'Result' })
  async review(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const schoolId = requireSchool(auth);
    const dto = reviewResultsSchema.parse(body);
    return this.results.reviewResults(schoolId, auth.user.id, {
      resultIds: dto.result_ids,
      examId: dto.exam_id,
      classId: dto.class_id,
    });
  }

  @Post('release')
  @CheckAbilities({ action: 'release', subject: 'Result' })
  @UseInterceptors(IdempotencyInterceptor)
  async release(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const schoolId = requireSchool(auth);
    const dto = releaseResultsSchema.parse(body);
    return this.results.releaseResults(
      schoolId,
      { id: auth.user.id, role: auth.user.role },
      { resultIds: dto.result_ids, examId: dto.exam_id, classId: dto.class_id },
      { notify: dto.notify },
    );
  }

  @Post('withdraw')
  @CheckAbilities({ action: 'update', subject: 'Result' })
  async withdraw(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const schoolId = requireSchool(auth);
    const dto = withdrawResultsSchema.parse(body);
    return this.results.withdrawResults(schoolId, auth.user.id, {
      resultIds: dto.result_ids,
      reason: dto.reason,
    });
  }

  /** Hand-mark a single answer (essays score 0 until marked, API spec 14.5). */
  @Post(':id/answers/:questionId/marks')
  @CheckAbilities({ action: 'update', subject: 'Result' })
  async markAnswer(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() body: unknown,
  ) {
    const schoolId = requireSchool(auth);
    const dto = manualMarkSchema.parse(body);
    return this.results.markAnswer(schoolId, auth.user.id, id, questionId, dto);
  }
}
