import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ResultsService } from './results.service';
import { GradeScaleService } from './grade-scale.service';
import {
  InMemoryDirectoryRepository,
  InMemoryGradeScaleRepository,
  InMemoryRemarkRunRepository,
  InMemoryResultRepository,
  InMemorySubmissionRepository,
} from './repositories';
import { InMemoryNotificationRepository } from '../notifications/repositories/notification.repository';
import { NotificationsService } from '../notifications/notifications.service';

const SCHOOL = 'school-1';

function seedDirectory(directory: InMemoryDirectoryRepository): void {
  directory.seedExam({
    id: 'exam-1',
    schoolId: SCHOOL,
    title: 'Mathematics Mid-Term',
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
      marks: 1,
      key: { type: 'single_choice', marks: 1, correct_option_ids: ['a'] },
    },
    {
      questionId: 'q2',
      examId: 'exam-1',
      position: 2,
      marks: 3,
      key: { type: 'fill_blank', marks: 3, fill: { answers: ['Abuja'], case_sensitive: false } },
    },
    {
      questionId: 'q3',
      examId: 'exam-1',
      position: 3,
      marks: 5,
      key: { type: 'essay', marks: 5 },
    },
  ]);
  directory.seedClass({ id: 'class-1', schoolId: SCHOOL, name: 'JSS 2 Gold', section: 'secondary' });
  directory.seedSitting({
    id: 'sitting-1',
    schoolId: SCHOOL,
    examId: 'exam-1',
    classId: 'class-1',
    status: 'closed',
  });
  directory.seedStudent({
    id: 'student-1',
    schoolId: SCHOOL,
    fullName: 'Tunde Bello',
    admissionNo: 'GRA/2023/0412',
    photoUrl: null,
  });
  directory.seedStudent({
    id: 'student-2',
    schoolId: SCHOOL,
    fullName: 'Ada Obi',
    admissionNo: 'GRA/2023/0413',
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
}

function submissionInput(studentId = 'student-1', sessionId = 'session-1') {
  return {
    submissionId: sessionId,
    schoolId: SCHOOL,
    sittingId: 'sitting-1',
    studentId,
    examId: 'exam-1',
    classId: 'class-1',
    packVersion: 1,
    keyVersion: 1,
    submittedAt: new Date('2026-10-20T09:41:12.000Z'),
    submitReason: 'student',
    answers: [
      { question_id: 'q1', answer: { option_id: 'a' } },
      { question_id: 'q2', answer: { text: 'Abuja' } },
      { question_id: 'q3', answer: { text: 'A long answer' } },
    ],
  };
}

describe('ResultsService', () => {
  let results: InMemoryResultRepository;
  let submissions: InMemorySubmissionRepository;
  let remarkRuns: InMemoryRemarkRunRepository;
  let directory: InMemoryDirectoryRepository;
  let gradeScales: GradeScaleService;
  let notifications: NotificationsService;
  let notificationRepo: InMemoryNotificationRepository;
  let service: ResultsService;

  beforeEach(async () => {
    results = new InMemoryResultRepository();
    submissions = new InMemorySubmissionRepository();
    remarkRuns = new InMemoryRemarkRunRepository();
    directory = new InMemoryDirectoryRepository();
    gradeScales = new GradeScaleService(new InMemoryGradeScaleRepository());
    notificationRepo = new InMemoryNotificationRepository();
    notifications = new NotificationsService(notificationRepo);
    seedDirectory(directory);
    service = new ResultsService(
      results,
      submissions,
      remarkRuns,
      directory,
      gradeScales,
      notifications,
    );
    await gradeScales.ensureDefault(SCHOOL);
  });

  it('marks a submission and creates a graded draft result', async () => {
    const result = await service.processSubmission(submissionInput());
    expect(result.status).toBe('draft');
    expect(result.score).toBe(4);
    expect(result.maxScore).toBe(9);
    expect(result.percent).toBe(44.44);
    expect(result.grade).toBe('E');
    expect(result.classId).toBe('class-1');
    expect(result.subjectId).toBe('subject-1');

    const stored = await submissions.listAnswers('session-1');
    expect(stored).toHaveLength(3);
    expect(stored.find((answer) => answer.questionId === 'q2')?.cloudMarks).toBe(3);
  });

  it('is idempotent when the same submission is re-marked', async () => {
    const first = await service.processSubmission(submissionInput());
    const second = await service.processSubmission(submissionInput());
    expect(second.id).toBe(first.id);
    expect(await results.list({ schoolId: SCHOOL })).toHaveLength(1);
  });

  it('reports a school/cloud score mismatch but keeps the cloud score', async () => {
    await service.processSubmission(submissionInput());
    const outcome = await service.recordSchoolScore(SCHOOL, 'session-1', {
      score: 6,
      maxScore: 9,
      keyVersion: 1,
    });
    expect(outcome.mismatch).toBe(true);
    expect(outcome.result?.score).toBe(4);
    const submission = await submissions.findById('session-1');
    expect(submission?.schoolScore).toBe(6);
  });

  it('moves drafts to reviewed and skips non-drafts', async () => {
    const result = await service.processSubmission(submissionInput());
    const first = await service.reviewResults(SCHOOL, 'teacher-1', { resultIds: [result.id] });
    expect(first).toEqual({ reviewed: 1, skipped: 0 });
    const second = await service.reviewResults(SCHOOL, 'teacher-1', { resultIds: [result.id] });
    expect(second).toEqual({ reviewed: 0, skipped: 1 });
  });

  it('refuses to release a result that has not been reviewed', async () => {
    await service.processSubmission(submissionInput());
    await expect(
      service.releaseResults(SCHOOL, 'admin-1', { examId: 'exam-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('releases reviewed results and queues a score-free notification per guardian', async () => {
    const result = await service.processSubmission(submissionInput());
    await service.reviewResults(SCHOOL, 'teacher-1', { resultIds: [result.id] });

    const released = await service.releaseResults(SCHOOL, 'admin-1', { examId: 'exam-1' });
    expect(released).toEqual({ released: 1, notificationsQueued: 1 });

    const stored = await results.findById(result.id);
    expect(stored?.status).toBe('released');
    expect(stored?.releasedBy).toBe('admin-1');

    const queued = await notificationRepo.list({ schoolId: SCHOOL });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ template: 'results_released', channel: 'email' });
    expect(JSON.stringify(queued[0]!.payload)).not.toContain('44.44');
  });

  it('withdraws results and hides their scores from the parent view', async () => {
    const result = await service.processSubmission(submissionInput());
    await service.reviewResults(SCHOOL, 'teacher-1', { resultIds: [result.id] });
    await service.releaseResults(SCHOOL, 'admin-1', { examId: 'exam-1' }, { notify: false });
    const withdrawn = await service.withdrawResults(SCHOOL, 'admin-1', {
      resultIds: [result.id],
      reason: 'Malpractice',
    });
    expect(withdrawn).toEqual({ withdrawn: 1 });
    const stored = await results.findById(result.id);
    expect(stored?.status).toBe('withdrawn');
    expect(stored?.withdrawnReason).toBe('Malpractice');
  });

  it('lists results with student names', async () => {
    await service.processSubmission(submissionInput());
    const list = await service.list(SCHOOL, { examId: 'exam-1' });
    expect(list).toHaveLength(1);
    expect(list[0]!.student.fullName).toBe('Tunde Bello');
  });

  it('returns a result detail with per-answer marks', async () => {
    const result = await service.processSubmission(submissionInput());
    const detail = await service.getDetail(SCHOOL, result.id);
    expect(detail.answers).toHaveLength(3);
    expect(detail.answers.find((answer) => answer.questionId === 'q1')?.marks).toBe(1);
    expect(detail.submitReason).toBe('student');
  });

  it('throws for a result in another school', async () => {
    const result = await service.processSubmission(submissionInput());
    await expect(service.getDetail('school-2', result.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('voids a submission and removes its result', async () => {
    await service.processSubmission(submissionInput());
    const voided = await service.voidSubmission(SCHOOL, 'session-1');
    expect(voided).toBe(true);
    expect(await results.list({ schoolId: SCHOOL })).toHaveLength(0);
  });

  it('previews and applies a key correction, bumping the revision', async () => {
    const first = await service.processSubmission(submissionInput('student-1', 'session-1'));
    await service.processSubmission(submissionInput('student-2', 'session-2'));

    const preview = await service.previewKeyCorrection(SCHOOL, 'teacher-1', {
      examId: 'exam-1',
      questionId: 'q1',
      correctOptionIds: ['b'],
      reason: 'Key typed the wrong option',
    });
    // Both students picked 'a', so both lose their mark.
    expect(preview.changes).toHaveLength(2);
    expect(preview.run.status).toBe('previewed');

    const applied = await service.applyKeyCorrection(SCHOOL, 'teacher-1', preview.run.id, {
      notifyOnRemark: false,
    });
    expect(applied.applied).toBe(2);

    const stored = await results.findById(first.id);
    expect(stored?.score).toBe(3);
    expect(stored?.revision).toBe(2);
    expect(stored?.updated).toBe(true);
  });

  it('notifies guardians when a released result changes', async () => {
    await service.processSubmission(submissionInput());
    const list = await service.list(SCHOOL, {});
    await service.reviewResults(SCHOOL, 'teacher-1', { resultIds: [list[0]!.id] });
    await service.releaseResults(SCHOOL, 'admin-1', { examId: 'exam-1' });

    const preview = await service.previewKeyCorrection(SCHOOL, 'teacher-1', {
      examId: 'exam-1',
      questionId: 'q1',
      correctOptionIds: ['b'],
      reason: 'Correction',
    });
    const applied = await service.applyKeyCorrection(SCHOOL, 'teacher-1', preview.run.id);
    expect(applied.notificationsQueued).toBe(1);
    const queued = await notificationRepo.list({ schoolId: SCHOOL, status: 'queued' });
    expect(queued).toHaveLength(2);
  });

  it('cancels a previewed correction', async () => {
    await service.processSubmission(submissionInput());
    const preview = await service.previewKeyCorrection(SCHOOL, 'teacher-1', {
      examId: 'exam-1',
      questionId: 'q1',
      correctOptionIds: ['b'],
      reason: 'Wrong',
    });
    const cancelled = await service.cancelKeyCorrection(SCHOOL, preview.run.id);
    expect(cancelled.status).toBe('cancelled');
    await expect(
      service.applyKeyCorrection(SCHOOL, 'teacher-1', preview.run.id),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('generates a class report', async () => {
    await service.processSubmission(submissionInput());
    const report = await service.generateResultReport(SCHOOL, 'exam-1');
    expect(report.summary.count).toBe(1);
    expect(report.rows[0]!.studentName).toBe('Tunde Bello');
  });

  it('generates a student report', async () => {
    await service.processSubmission(submissionInput());
    const report = await service.generateStudentReport(SCHOOL, 'student-1');
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]!.examTitle).toBe('Mathematics Mid-Term');
  });
});
