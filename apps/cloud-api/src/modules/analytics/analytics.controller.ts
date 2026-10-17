import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { requireSchool } from '../../common/request-context';
import { CheckAbilities } from '../auth/decorators/check-abilities.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthContext } from '../auth/domain/types';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AnalyticsService } from './analytics.service';

/** Exam statistics, dashboards and anomaly detection (Epic 11, US-14.1/14.2). */
@Controller()
@UseGuards(AuthGuard, AbilitiesGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Average, highest, lowest, pass rate and per-question analysis (US-11.3). */
  @Get('exams/:examId/stats')
  @CheckAbilities({ action: 'read', subject: 'Result' })
  async examStats(
    @CurrentAuth() auth: AuthContext,
    @Param('examId') examId: string,
    @Query('class_id') classId?: string,
  ) {
    const schoolId = requireSchool(auth);
    return this.analytics.examStatistics(schoolId, examId, classId);
  }

  @Get('analytics/classes/:classId/exams/:examId/stats')
  @CheckAbilities({ action: 'read', subject: 'Result' })
  async classStats(
    @CurrentAuth() auth: AuthContext,
    @Param('classId') classId: string,
    @Param('examId') examId: string,
  ) {
    const schoolId = requireSchool(auth);
    return this.analytics.calculateClassStatistics(schoolId, classId, examId);
  }

  @Get('analytics/exams/:examId/anomalies')
  @CheckAbilities({ action: 'read', subject: 'Result' })
  async anomalies(
    @CurrentAuth() auth: AuthContext,
    @Param('examId') examId: string,
    @Query('class_id') classId?: string,
  ) {
    const schoolId = requireSchool(auth);
    return { data: await this.analytics.detectExamAnomalies(schoolId, examId, classId) };
  }

  @Get('dashboard/admin')
  @CheckAbilities({ action: 'read', subject: 'Dashboard' })
  async adminDashboard(@CurrentAuth() auth: AuthContext) {
    return this.analytics.generateDashboardData(requireSchool(auth), 'school_admin');
  }

  @Get('dashboard/teacher')
  @CheckAbilities({ action: 'read', subject: 'Dashboard' })
  async teacherDashboard(@CurrentAuth() auth: AuthContext) {
    return this.analytics.generateDashboardData(requireSchool(auth), 'teacher', auth.user.id);
  }
}
