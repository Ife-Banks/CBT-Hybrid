import { Inject, Injectable } from '@nestjs/common';
import {
  RESULT_REPOSITORY,
  RESULTS_DIRECTORY,
  SUBMISSION_REPOSITORY,
  type DirectoryRepository,
  type ResultRepository,
  type SubmissionRepository,
} from '../results/repositories';
import type { ShareResult } from './analytics.types';
import {
  computeAggregateStatistics,
  computeQuestionStatistics,
  type AggregateStatistics,
  type QuestionMeta,
  type QuestionStatistic,
} from './domain/statistics';
import type { ResultStatus } from '../results/domain/types';
import { computePerformanceTrends, type PerformanceTrend } from './domain/trends';
import { detectAnomalies, type Anomaly, type AnomalyOptions, type AnomalyResultSample } from './domain/anomalies';

export interface ClassStatistics {
  examId: string;
  classId: string;
  aggregate: AggregateStatistics;
  perQuestion: QuestionStatistic[];
}

export interface DashboardData {
  role: string;
  results: {
    awaitingReview: number;
    awaitingRelease: number;
    released: number;
  };
  sittings: {
    total: number;
    upcoming: number;
    completed: number;
  };
  pendingInvitations: number;
  activeImports: number;
  lastSyncedAt: string | null;
  exams: Array<{ id: string; title: string; subject: string | null; classes: number }>;
}

/**
 * Analytics engine (Epic 11/14). All figures are derived from the stored results
 * and submission answers; the heavy lifting lives in pure domain helpers.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(RESULT_REPOSITORY) private readonly results: ResultRepository,
    @Inject(SUBMISSION_REPOSITORY) private readonly submissions: SubmissionRepository,
    @Inject(RESULTS_DIRECTORY) private readonly directory: DirectoryRepository,
  ) {}

  async calculateClassStatistics(
    schoolId: string,
    classId: string,
    examId: string,
  ): Promise<ClassStatistics> {
    const exam = await this.directory.getExam(examId);
    const results = await this.results.list({ schoolId, examId, classId });
    const aggregate = computeAggregateStatistics(
      results.map((result) => ({ percent: result.percent, grade: result.grade })),
      exam?.passMarkPct ?? null,
    );
    const perQuestion = await this.questionStatistics(schoolId, examId, classId);
    return { examId, classId, aggregate, perQuestion };
  }

  /** Per-question percent correct and option counts (US-11.3). */
  async questionStatistics(
    schoolId: string,
    examId: string,
    classId?: string,
  ): Promise<QuestionStatistic[]> {
    const questions = await this.directory.listExamQuestions(examId);
    if (questions.length === 0) return [];
    const submissions = await this.submissions.list({ schoolId, examId, classId });
    const answers = await this.submissions.listAnswersForSubmissions(
      submissions.map((submission) => submission.id),
    );
    const metas: QuestionMeta[] = questions.map((question) => ({
      questionId: question.questionId,
      optionIds: 'correct_option_ids' in question.key ? question.key.correct_option_ids : [],
    }));
    return computeQuestionStatistics(
      metas,
      answers.map((answer) => ({
        questionId: answer.questionId,
        answer: answer.answer,
        marks: answer.cloudMarks ?? 0,
        maxMarks: answer.maxMarks ?? 0,
      })),
    );
  }

  /** Full exam statistics for the results dashboard. */
  async examStatistics(
    schoolId: string,
    examId: string,
    classId?: string,
  ): Promise<{
    aggregate: AggregateStatistics;
    perQuestion: QuestionStatistic[];
  }> {
    const exam = await this.directory.getExam(examId);
    const results = await this.results.list({ schoolId, examId, classId });
    const aggregate = computeAggregateStatistics(
      results.map((result) => ({ percent: result.percent, grade: result.grade })),
      exam?.passMarkPct ?? null,
    );
    const perQuestion = await this.questionStatistics(schoolId, examId, classId);
    return { aggregate, perQuestion };
  }

  async getPerformanceTrends(
    schoolId: string,
    studentId: string,
    options: { statuses?: ResultStatus[] } = {},
  ): Promise<PerformanceTrend> {
    const results = await this.results.list({
      schoolId,
      studentId,
      ...(options.statuses ? { statuses: options.statuses } : {}),
    });
    const examIds = [...new Set(results.map((result) => result.examId))];
    const exams = new Map(
      (await Promise.all(examIds.map((examId) => this.directory.getExam(examId))))
        .filter((exam): exam is NonNullable<typeof exam> => exam !== null)
        .map((exam) => [exam.id, exam]),
    );
    return computePerformanceTrends(
      results.map((result) => {
        const exam = exams.get(result.examId);
        return {
          examId: result.examId,
          examTitle: exam?.title ?? null,
          subjectId: result.subjectId ?? exam?.subjectId ?? null,
          subjectName: exam?.subjectName ?? null,
          date: result.createdAt.toISOString(),
          percent: result.percent,
        };
      }),
    );
  }

  async detectExamAnomalies(
    schoolId: string,
    examId: string,
    classId?: string,
    options: AnomalyOptions = {},
  ): Promise<Anomaly[]> {
    const results = await this.results.list({ schoolId, examId, classId });
    const submissions = await this.submissions.list({ schoolId, examId, classId });
    const submissionById = new Map(submissions.map((submission) => [submission.id, submission]));
    const samples: AnomalyResultSample[] = results.map((result) => {
      const submission = submissionById.get(result.submissionId);
      return {
        studentId: result.studentId,
        percent: result.percent,
        score: result.score,
        maxScore: result.maxScore,
        schoolScore: submission?.schoolScore ?? null,
        cloudScore: submission?.cloudScore ?? result.score,
        focusLostCount: submission?.focusLostCount ?? 0,
      };
    });
    const perQuestion = await this.questionStatistics(schoolId, examId, classId);
    return detectAnomalies(examId, samples, perQuestion, options);
  }

  /**
   * Dashboard summary (API spec 11.1, US-14.1/14.2): the review queue plus
   * sittings/readiness, pending invitations, in-flight imports, the last sync
   * time and the exams the caller cares about (a teacher sees only their own).
   */
  async generateDashboardData(
    schoolId: string,
    role: string,
    userId?: string,
  ): Promise<DashboardData> {
    const [
      awaitingReview,
      awaitingRelease,
      released,
      sittings,
      pendingInvitations,
      activeImports,
      submissions,
      exams,
    ] = await Promise.all([
      this.results.countByStatus(schoolId, 'draft'),
      this.results.countByStatus(schoolId, 'reviewed'),
      this.results.countByStatus(schoolId, 'released'),
      this.directory.listSittings(schoolId),
      this.directory.countPendingInvitations(schoolId),
      this.directory.countActiveImports(schoolId),
      this.submissions.list({ schoolId }),
      this.directory.listExams(
        schoolId,
        role === 'teacher' && userId ? { createdBy: userId } : {},
      ),
    ]);

    let lastSyncedAt: Date | null = null;
    for (const submission of submissions) {
      if (!lastSyncedAt || submission.updatedAt.getTime() > lastSyncedAt.getTime()) {
        lastSyncedAt = submission.updatedAt;
      }
    }

    return {
      role,
      results: { awaitingReview, awaitingRelease, released },
      sittings: {
        total: sittings.length,
        upcoming: sittings.filter((sitting) => sitting.status === 'scheduled' || sitting.status === 'open')
          .length,
        completed: sittings.filter(
          (sitting) => sitting.status === 'closed' || sitting.status === 'cancelled',
        ).length,
      },
      pendingInvitations,
      activeImports,
      lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
      exams: exams.slice(0, 5).map((exam) => ({
        id: exam.id,
        title: exam.title,
        subject: exam.subjectName,
        classes: exam.classIds.length,
      })),
    };
  }

  /** Class average and pass mark for the parent result view. */
  async classShare(schoolId: string, examId: string, classId: string): Promise<ShareResult> {
    const exam = await this.directory.getExam(examId);
    const results = await this.results.list({ schoolId, examId, classId });
    const aggregate = computeAggregateStatistics(
      results.map((result) => ({ percent: result.percent, grade: result.grade })),
      exam?.passMarkPct ?? null,
    );
    return { classAveragePercent: aggregate.averagePercent, count: aggregate.count };
  }
}
