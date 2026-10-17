import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { requireSchool } from '../../common/request-context';
import { CheckAbilities } from '../auth/decorators/check-abilities.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthContext } from '../auth/domain/types';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ResultsService } from './results.service';

/**
 * Result reports (US-11.6/11.7). These return the structured report; the file
 * encoders render it to `.xlsx`/`.pdf` in the reporting phase.
 */
@Controller()
@UseGuards(AuthGuard, AbilitiesGuard)
export class ReportsController {
  constructor(private readonly results: ResultsService) {}

  @Get('exams/:examId/result-report')
  @CheckAbilities({ action: 'read', subject: 'Report' })
  async examReport(
    @CurrentAuth() auth: AuthContext,
    @Param('examId') examId: string,
    @Query('class_id') classId?: string,
  ) {
    const schoolId = requireSchool(auth);
    return this.results.generateResultReport(schoolId, examId, classId);
  }

  @Get('students/:studentId/result-report')
  @CheckAbilities({ action: 'read', subject: 'Report' })
  async studentReport(@CurrentAuth() auth: AuthContext, @Param('studentId') studentId: string) {
    const schoolId = requireSchool(auth);
    return this.results.generateStudentReport(schoolId, studentId);
  }
}
