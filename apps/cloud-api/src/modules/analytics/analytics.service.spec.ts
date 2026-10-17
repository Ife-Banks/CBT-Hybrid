import { beforeEach, describe, expect, it } from 'vitest';
import { AnalyticsService } from './analytics.service';
import {
  InMemoryDirectoryRepository,
  InMemoryResultRepository,
  InMemorySubmissionRepository,
} from '../results/repositories';

const SCHOOL = 'school-1';

describe('AnalyticsService', () => {
  let results: InMemoryResultRepository;
  let submissions: InMemorySubmissionRepository;
  let directory: InMemoryDirectoryRepository;
  let service: AnalyticsService;

  beforeEach(() => {
    results = new InMemoryResultRepository();
    submissions = new InMemorySubmissionRepository();
    directory = new InMemoryDirectoryRepository();
    directory.seedExam({
      id: 'exam-1',
      schoolId: SCHOOL,
      title: 'Maths',
      subjectId: 'subject-1',
      subjectName: 'Mathematics',
      classIds: ['class-1'],
      passMarkPct: 50,
      showScoreToStudent: true,
      createdBy: 'teacher-1',
    });
    directory.seedExamQuestions('exam-1', [
      {
        questionId: 'q1',
        examId: 'exam-1',
        position: 1,
        marks: 2,
        key: { type: 'single_choice', marks: 2, correct_option_ids: ['a'] },
      },
    ]);
    service = new AnalyticsService(results, submissions, directory);
  });

  async function seedResult(
    id: string,
    studentId: string,
    percent: number,
    grade: string,
    choice: string,
  ): Promise<void> {
    await submissions.upsert({
      id: `session-${id}`,
      schoolId: SCHOOL,
      sittingId: 'sitting-1',
      studentId,
      examId: 'exam-1',
      classId: 'class-1',
      packVersion: 1,
      cloudScore: percent * 0.02,
    });
    await submissions.saveAnswers(`session-${id}`, [
      {
        submissionId: `session-${id}`,
        questionId: 'q1',
        answer: { option_id: choice },
        flagged: false,
        seq: 1,
        answeredAt: null,
        cloudMarks: choice === 'a' ? 2 : 0,
        maxMarks: 2,
      },
    ]);
    await results.create({
      id,
      submissionId: `session-${id}`,
      schoolId: SCHOOL,
      studentId,
      examId: 'exam-1',
      classId: 'class-1',
      subjectId: 'subject-1',
      score: percent * 0.02,
      maxScore: 2,
      percent,
      grade,
    });
  }

  it('calculates class statistics with per-question analysis', async () => {
    await seedResult('r1', 'student-1', 100, 'A', 'a');
    await seedResult('r2', 'student-2', 0, 'F', 'b');

    const stats = await service.calculateClassStatistics(SCHOOL, 'class-1', 'exam-1');
    expect(stats.aggregate.count).toBe(2);
    expect(stats.aggregate.averagePercent).toBe(50);
    expect(stats.aggregate.passRate).toBe(50);
    expect(stats.perQuestion[0]).toMatchObject({ questionId: 'q1', attempted: 2, correct: 1, percentCorrect: 50 });
    expect(stats.perQuestion[0]!.optionCounts).toEqual({ a: 1, b: 1 });
  });

  it('returns exam statistics', async () => {
    await seedResult('r1', 'student-1', 100, 'A', 'a');
    const stats = await service.examStatistics(SCHOOL, 'exam-1');
    expect(stats.aggregate.highestPercent).toBe(100);
  });

  it('detects anomalies across stored results', async () => {
    await seedResult('r1', 'student-1', 100, 'A', 'a');
    await submissions.update('session-r1', { schoolScore: 1 });
    const anomalies = await service.detectExamAnomalies(SCHOOL, 'exam-1');
    expect(anomalies.some((anomaly) => anomaly.type === 'score_mismatch')).toBe(true);
  });

  it('builds a dashboard summary from the review queue', async () => {
    await seedResult('r1', 'student-1', 100, 'A', 'a');
    await results.update('r1', { status: 'reviewed' });
    await seedResult('r2', 'student-2', 60, 'B', 'b');

    const dashboard = await service.generateDashboardData(SCHOOL, 'school_admin');
    expect(dashboard).toEqual({
      role: 'school_admin',
      results: { awaitingReview: 1, awaitingRelease: 1, released: 0 },
    });
  });

  it('computes class share for the parent view', async () => {
    await seedResult('r1', 'student-1', 100, 'A', 'a');
    await seedResult('r2', 'student-2', 0, 'F', 'b');
    const share = await service.classShare(SCHOOL, 'exam-1', 'class-1');
    expect(share).toEqual({ classAveragePercent: 50, count: 2 });
  });
});
