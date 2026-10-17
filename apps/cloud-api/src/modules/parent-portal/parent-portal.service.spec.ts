import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ParentPortalService } from './parent-portal.service';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  InMemoryDirectoryRepository,
  InMemoryResultRepository,
  InMemorySubmissionRepository,
} from '../results/repositories';

const SCHOOL = 'school-1';

describe('ParentPortalService', () => {
  let results: InMemoryResultRepository;
  let directory: InMemoryDirectoryRepository;
  let service: ParentPortalService;

  beforeEach(() => {
    results = new InMemoryResultRepository();
    const submissions = new InMemorySubmissionRepository();
    directory = new InMemoryDirectoryRepository();
    directory.seedExam({
      id: 'exam-1',
      schoolId: SCHOOL,
      title: 'Maths Mid-Term',
      subjectId: 'subject-1',
      subjectName: 'Mathematics',
      classIds: ['class-1'],
      passMarkPct: 50,
      showScoreToStudent: true,
      createdBy: 'teacher-1',
    });
    directory.seedClass({ id: 'class-1', schoolId: SCHOOL, name: 'JSS 2 Gold', section: 'secondary' });
    directory.seedStudent({
      id: 'student-1',
      schoolId: SCHOOL,
      fullName: 'Tunde Bello',
      admissionNo: 'A1',
      photoUrl: null,
    });
    directory.seedStudent({
      id: 'student-2',
      schoolId: SCHOOL,
      fullName: 'Other Child',
      admissionNo: 'A2',
      photoUrl: null,
    });
    directory.seedGuardian({
      id: 'guardian-1',
      schoolId: SCHOOL,
      userId: 'user-guardian-1',
      fullName: 'Mrs Bello',
      email: 'bello@example.com',
      phoneE164: null,
    });
    directory.seedGuardianship({
      guardianId: 'guardian-1',
      studentId: 'student-1',
      relationship: 'mother',
      canViewResults: true,
    });
    const analytics = new AnalyticsService(results, submissions, directory);
    service = new ParentPortalService(results, directory, analytics);
  });

  async function addResult(id: string, status: 'draft' | 'reviewed' | 'released' | 'withdrawn') {
    return results.create({
      id,
      submissionId: `session-${id}`,
      schoolId: SCHOOL,
      studentId: 'student-1',
      examId: 'exam-1',
      classId: 'class-1',
      subjectId: 'subject-1',
      score: 34,
      maxScore: 40,
      percent: 85,
      grade: 'A',
      status,
    });
  }

  it('resolves the guardian linked to a parent user', async () => {
    expect(await service.resolveGuardian(SCHOOL, 'user-guardian-1')).toBe('guardian-1');
    await expect(service.resolveGuardian(SCHOOL, 'nobody')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists linked children with their class and latest result', async () => {
    await addResult('result-1', 'released');
    const children = await service.listChildren(SCHOOL, 'guardian-1');
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({
      studentId: 'student-1',
      fullName: 'Tunde Bello',
      className: 'JSS 2 Gold',
      resultsVisible: true,
    });
    expect(children[0]!.latestResultAt).not.toBeNull();
  });

  it('only returns released results to a parent', async () => {
    await addResult('result-1', 'released');
    await addResult('result-2', 'draft');
    await addResult('result-3', 'reviewed');
    const list = await service.getChildrenResults(SCHOOL, 'guardian-1', 'student-1');
    expect(list).toHaveLength(1);
    expect(list[0]!.resultId).toBe('result-1');
    expect(list[0]!.status).toBe('released');
  });

  it('returns an empty list when the guardian cannot view results', async () => {
    directory.seedGuardianship({
      guardianId: 'guardian-2',
      studentId: 'student-1',
      relationship: 'father',
      canViewResults: false,
    });
    await addResult('result-1', 'released');
    const list = await service.getChildrenResults(SCHOOL, 'guardian-2', 'student-1');
    expect(list).toEqual([]);
    await expect(
      service.getResultDetails(SCHOOL, 'guardian-2', 'student-1', 'result-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides results for an unrelated child', async () => {
    await expect(
      service.getChildrenResults(SCHOOL, 'guardian-1', 'student-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shows a withdrawn result as under review', async () => {
    await addResult('result-1', 'withdrawn');
    const detail = await service.getResultDetails(SCHOOL, 'guardian-1', 'student-1', 'result-1');
    expect(detail).toEqual({ status: 'under_review' });
  });

  it('returns a released result with the class average', async () => {
    await addResult('result-1', 'released');
    const detail = await service.getResultDetails(SCHOOL, 'guardian-1', 'student-1', 'result-1');
    expect(detail).toMatchObject({
      resultId: 'result-1',
      examTitle: 'Maths Mid-Term',
      percent: 85,
      status: 'released',
    });
  });

  it('builds a performance history from released results', async () => {
    await addResult('result-1', 'released');
    await addResult('result-2', 'draft');
    const history = await service.getPerformanceHistory(SCHOOL, 'guardian-1', 'student-1');
    expect(history.subjects).toHaveLength(1);
    expect(history.subjects[0]!.subjectName).toBe('Mathematics');
  });
});
