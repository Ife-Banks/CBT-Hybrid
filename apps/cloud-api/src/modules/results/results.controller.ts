import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { requireSchool } from '../../common/request-context';
import { CheckAbilities } from '../auth/decorators/check-abilities.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthContext } from '../auth/domain/types';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import {
  releaseResultsSchema,
  resultListQuerySchema,
  reviewResultsSchema,
  withdrawResultsSchema,
} from './dto/results.dto';
import { ResultsService } from './results.service';

/**
 * Results review and release (API spec section 9). Marking happens when results
 * sync up; these routes let a teacher or admin review, release and withdraw.
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
    const data = await this.results.list(schoolId, {
      examId: parsed.exam_id,
      classId: parsed.class_id,
      status: parsed.status,
      studentId: parsed.student_id,
    });
    return { data };
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
  async release(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const schoolId = requireSchool(auth);
    const dto = releaseResultsSchema.parse(body);
    return this.results.releaseResults(
      schoolId,
      auth.user.id,
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
}
