import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  RESULT_REPOSITORY,
  RESULTS_DIRECTORY,
  type DirectoryRepository,
  type ResultRepository,
} from '../results/repositories';
import type { ResultRecord } from '../results/domain/types';

export interface ChildSummary {
  studentId: string;
  fullName: string;
  className: string | null;
  photoUrl: string | null;
  resultsVisible: boolean;
  latestResultAt: string | null;
}

export interface ParentResultView {
  resultId: string;
  examTitle: string;
  subject: string | null;
  date: string;
  score: number;
  maxScore: number;
  percent: number;
  grade: string | null;
  classAveragePercent: number;
  updated: boolean;
  status: 'released';
}

export interface ParentPerformanceHistory {
  subjects: Array<{
    subjectId: string | null;
    subjectName: string | null;
    latestPercent: number;
    averagePercent: number;
    direction: 'up' | 'down' | 'flat';
    points: Array<{ examId: string; date: string; percent: number }>;
  }>;
  overall: {
    averagePercent: number;
    latestPercent: number | null;
    direction: 'up' | 'down' | 'flat';
  };
}

/**
 * Parent portal reads (API spec 10). Every query enforces three things: the
 * child is linked to this guardian, the link has `can_view_results`, and the
 * result is `released` (BR-05, BR-06, BR-14). A child that is not linked is a
 * `404`, never a `403`.
 */
@Injectable()
export class ParentPortalService {
  constructor(
    @Inject(RESULT_REPOSITORY) private readonly results: ResultRepository,
    @Inject(RESULTS_DIRECTORY) private readonly directory: DirectoryRepository,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Resolve the guardian linked to a signed-in parent user. */
  async resolveGuardian(schoolId: string, userId: string): Promise<string> {
    const guardian = await this.directory.getGuardianByUserId(userId);
    if (!guardian || guardian.schoolId !== schoolId) {
      throw new NotFoundException({ code: 'GUARDIAN_NOT_FOUND', message: 'Guardian not found' });
    }
    return guardian.id;
  }

  async listChildren(schoolId: string, guardianId: string): Promise<ChildSummary[]> {    const links = await this.directory.listGuardianshipsByGuardian(guardianId);
    const summaries: ChildSummary[] = [];
    for (const link of links) {
      const student = await this.directory.getStudent(link.studentId);
      if (!student || student.schoolId !== schoolId) continue;
      const released = (await this.results.list({ schoolId, studentId: link.studentId, status: 'released' }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const latest = released[0] ?? null;
      const className = latest?.classId
        ? (await this.directory.getClass(latest.classId))?.name ?? null
        : null;
      summaries.push({
        studentId: student.id,
        fullName: student.fullName,
        className,
        photoUrl: student.photoUrl,
        resultsVisible: link.canViewResults,
        latestResultAt: latest ? latest.createdAt.toISOString() : null,
      });
    }
    return summaries;
  }

  async getChildrenResults(
    schoolId: string,
    guardianId: string,
    studentId: string,
    filter: { subjectId?: string; termId?: string } = {},
  ): Promise<ParentResultView[]> {
    const link = await this.assertVisible(schoolId, guardianId, studentId);
    if (!link.canViewResults) return [];
    // `term_id` is accepted for forward compatibility; terms are not modelled in
    // this phase (results carry no term), so it does not narrow the list yet.
    const released = await this.results.list({ schoolId, studentId, status: 'released' });
    const filtered = filter.subjectId
      ? released.filter((result) => result.subjectId === filter.subjectId)
      : released;
    const views: ParentResultView[] = [];
    for (const result of filtered) {
      views.push(await this.toView(schoolId, result));
    }
    return views.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getResultDetails(
    schoolId: string,
    guardianId: string,
    studentId: string,
    resultId: string,
  ): Promise<ParentResultView | { status: 'under_review' }> {
    const link = await this.assertVisible(schoolId, guardianId, studentId);
    if (!link.canViewResults) {
      throw new NotFoundException({ code: 'RESULT_NOT_FOUND', message: 'Result not found' });
    }
    const result = await this.results.findById(resultId);
    if (!result || result.schoolId !== schoolId || result.studentId !== studentId) {
      throw new NotFoundException({ code: 'RESULT_NOT_FOUND', message: 'Result not found' });
    }
    // A parent never sees a withdrawn result's scores.
    if (result.status === 'withdrawn' || result.status !== 'released') {
      if (result.status === 'withdrawn') return { status: 'under_review' };
      throw new NotFoundException({ code: 'RESULT_NOT_FOUND', message: 'Result not found' });
    }
    return this.toView(schoolId, result);
  }

  async getPerformanceHistory(
    schoolId: string,
    guardianId: string,
    studentId: string,
  ): Promise<ParentPerformanceHistory> {
    const link = await this.assertVisible(schoolId, guardianId, studentId);
    if (!link.canViewResults) {
      return { subjects: [], overall: { averagePercent: 0, latestPercent: null, direction: 'flat' } };
    }
    const trend = await this.analytics.getPerformanceTrends(schoolId, studentId, {
      statuses: ['released'],
    });
    return {
      subjects: trend.subjects.map((subject) => ({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        latestPercent: subject.latestPercent,
        averagePercent: subject.averagePercent,
        direction: subject.direction,
        points: subject.points,
      })),
      overall: {
        averagePercent: trend.overall.averagePercent,
        latestPercent: trend.overall.latestPercent,
        direction: trend.overall.direction,
      },
    };
  }

  private async assertVisible(schoolId: string, guardianId: string, studentId: string) {
    const link = await this.directory.getGuardianship(guardianId, studentId);
    const student = await this.directory.getStudent(studentId);
    if (!link || !student || student.schoolId !== schoolId) {
      throw new NotFoundException({ code: 'CHILD_NOT_FOUND', message: 'Child not found' });
    }
    return link;
  }

  private async toView(schoolId: string, result: ResultRecord): Promise<ParentResultView> {
    const exam = await this.directory.getExam(result.examId);
    const share = result.classId
      ? await this.analytics.classShare(schoolId, result.examId, result.classId)
      : { classAveragePercent: 0, count: 0 };
    return {
      resultId: result.id,
      examTitle: exam?.title ?? 'Exam',
      subject: exam?.subjectName ?? null,
      date: result.createdAt.toISOString().slice(0, 10),
      score: result.score,
      maxScore: result.maxScore,
      percent: result.percent,
      grade: result.grade,
      classAveragePercent: share.classAveragePercent,
      updated: result.updated,
      status: 'released',
    };
  }
}
