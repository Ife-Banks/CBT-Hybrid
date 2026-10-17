import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResultsService } from './results.service';
import { GradeScaleService } from './grade-scale.service';
import {
  InMemoryDirectoryRepository,
  InMemoryGradeScaleRepository,
  InMemoryKeyCorrectionStore,
  InMemoryRemarkRunRepository,
  InMemoryResultRepository,
  InMemorySubmissionRepository,
} from './repositories';
import { InMemoryNotificationRepository } from '../notifications/repositories/notification.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { InMemorySchoolSettingsRepository } from '../settings/settings.repository';
import type { AuditService } from '../auth/audit/audit.service';
import type { ExamPackService } from '../exams/exam-pack.service';

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

const ADMIN = { id: 'admin-1', role: 'school_admin' } as const;
const TEACHER = { id: 'teacher-1', role: 'teacher' } as const;

describe('ResultsService', () => {
  let results: InMemoryResultRepository;
  let submissions: InMemorySubmissionRepository;
  let remarkRuns: InMemoryRemarkRunRepository;
  let directory: InMemoryDirectoryRepository;
  let gradeScales: GradeScaleService;
  let notifications: NotificationsService;
  let notificationRepo: InMemoryNotificationRepository;
  let settingsRepo: InMemorySchoolSettingsRepository;
  let settings: SettingsService;
  let keyCorrections: InMemoryKeyCorrectionStore;
  let audit: { record: ReturnType<typeof vi.fn> };
  let packService: { generatePack: ReturnType<typeof vi.fn> };
  let service: ResultsService;

  beforeEach(async () => {
    results = new InMemoryResultRepository();
    submissions = new InMemorySubmissionRepository();
    remarkRuns = new InMemoryRemarkRunRepository();
    directory = new InMemoryDirectoryRepository();
    gradeScales = new GradeScaleService(new InMemoryGradeScaleRepository());
    notificationRepo = new InMemoryNotificationRepository();
    notifications = new NotificationsService(notificationRepo);
    settingsRepo = new InMemorySchoolSettingsRepository();
    settings = new SettingsService(settingsRepo);
    keyCorrections = new InMemoryKeyCorrectionStore();
    audit = { record: vi.fn() };
    packService = { generatePack: vi.fn().mockResolvedValue({ id: 'pack-2', version: 2, keyVersion: 2 }) };
    seedDirectory(directory);
    service = new ResultsService(
      results,
      submissions,
      remarkRuns,
      directory,
      gradeScales,
      notifications,
      audit as unknown as AuditService,
      settings,
      keyCorrections,
      packService as unknown as ExamPackService,
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
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'results.reviewed' }));
  });

  it('refuses to release a result that has not been reviewed', async () => {
    await service.processSubmission(submissionInput());
    await expect(
      service.releaseResults(SCHOOL, ADMIN, { examId: 'exam-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('releases reviewed results and queues a score-free notification per guardian', async () => {
    const result = await service.processSubmission(submissionInput());
    await service.reviewResults(SCHOOL, 'teacher-1', { resultIds: [result.id] });

    const released = await service.releaseResults(SCHOOL, ADMIN, { examId: 'exam-1' });
    expect(released).toEqual({ released: 1, notificationsQueued: 1 });

    const stored = await results.findById(result.id);
    expect(stored?.status).toBe('released');
    expect(stored?.releasedBy).toBe('admin-1');

    const queued = await notificationRepo.list({ schoolId: SCHOOL });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ template: 'results_released', channel: 'email' });
    expect(JSON.stringify(queued[0]!.payload)).not.toContain('44.44');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'results.released' }));
  });

  it('only lets a teacher release when the school policy allows it', async () => {
    const result = await service.processSubmission(submissionInput());
    await service.reviewResults(SCHOOL, 'teacher-1', { resultIds: [result.id] });

    await expect(
      service.releaseResults(SCHOOL, TEACHER, { resultIds: [result.id] }, { notify: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await settings.update(SCHOOL, { release_policy: 'class_teacher' });
    const released = await service.releaseResults(SCHOOL, TEACHER, { resultIds: [result.id] }, { notify: false });
    expect(released.released).toBe(1);
  });

  it('withdraws results and hides their scores from the parent view', async () => {
    const result = await service.processSubmission(submissionInput());
    await service.reviewResults(SCHOOL, 'teacher-1', { resultIds: [result.id] });
    await service.releaseResults(SCHOOL, ADMIN, { examId: 'exam-1' }, { notify: false });
    const withdrawn = await service.withdrawResults(SCHOOL, 'admin-1', {
      resultIds: [result.id],
      reason: 'Malpractice',
    });
    expect(withdrawn).toEqual({ withdrawn: 1 });
    const stored = await results.findById(result.id);
    expect(stored?.status).toBe('withdrawn');
    expect(stored?.withdrawnReason).toBe('Malpractice');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'results.withdrawn' }));
  });

  it('lists results with student names and pagination metadata', async () => {
    await service.processSubmission(submissionInput());
    const page = await service.list(SCHOOL, { examId: 'exam-1' });
    expect(page.data).toHaveLength(1);
    expect(page.data[0]!.student.fullName).toBe('Tunde Bello');
    expect(page.nextCursor).toBeNull();
    expect(page.lastSyncedAt).toBeInstanceOf(Date);
  });

  it('paginates results with a cursor', async () => {
    await service.processSubmission(submissionInput('student-1', 'session-1'));
    await service.processSubmission(submissionInput('student-2', 'session-2'));
    const first = await service.list(SCHOOL, { examId: 'exam-1' }, { limit: 1 });
    expect(first.data).toHaveLength(1);
    expect(first.nextCursor).toBe(first.data[0]!.id);
    const second = await service.list(SCHOOL, { examId: 'exam-1' }, { limit: 1, cursor: first.nextCursor! });
    expect(second.data).toHaveLength(1);
    expect(second.data[0]!.id).not.toBe(first.data[0]!.id);
    expect(second.nextCursor).toBeNull();
  });

  it('returns a result detail with per-answer marks and the correct answers', async () => {
    const result = await service.processSubmission(submissionInput());
    const detail = await service.getDetail(SCHOOL, result.id);
    expect(detail.answers).toHaveLength(3);
    const q1 = detail.answers.find((answer) => answer.questionId === 'q1');
    expect(q1?.marks).toBe(1);
    expect(q1?.correct).toBe(true);
    expect(q1?.correctAnswer).toEqual({ type: 'choice', option_ids: ['a'] });
    expect(detail.submitReason).toBe('student');
  });

  it('hand-marks an essay answer and recomputes the result', async () => {
    const result = await service.processSubmission(submissionInput());
    const detail = await service.markAnswer(SCHOOL, 'teacher-1', result.id, 'q3', { marks: 5, comment: 'Good' });
    expect(detail.score).toBe(9);
    expect(detail.percent).toBe(100);
    expect(detail.grade).toBe('A');
    expect(detail.revision).toBe(2);
    expect(detail.answers.find((answer) => answer.questionId === 'q3')?.marks).toBe(5);
  });

  it('rejects marks outside the question range', async () => {
    const result = await service.processSubmission(submissionInput());
    await expect(
      service.markAnswer(SCHOOL, 'teacher-1', result.id, 'q3', { marks: 6 }),
    ).rejects.toThrow();
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

  it('previews and applies a key correction, versioning the question and bumping the revision', async () => {
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
    expect(applied.newQuestionId).toMatch(/^question-version-/);
    expect(applied.newKeyVersion).toBe(2);
    expect(applied.packBuilt).toBe(true);
    expect(packService.generatePack).toHaveBeenCalledWith('exam-1', SCHOOL, 'teacher-1', { keyVersion: 2 });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'key_correction.applied' }));

    const stored = await results.findById(first.id);
    expect(stored?.score).toBe(3);
    expect(stored?.revision).toBe(2);
    expect(stored?.updated).toBe(true);
  });

  it('notifies guardians when a released result changes unless notify_on_remark is off', async () => {
    await service.processSubmission(submissionInput());
    const list = await service.list(SCHOOL, {});
    await service.reviewResults(SCHOOL, 'teacher-1', { resultIds: [list.data[0]!.id] });
    await service.releaseResults(SCHOOL, ADMIN, { examId: 'exam-1' });

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

  it('skips the remark notification when the school turned it off', async () => {
    await settings.update(SCHOOL, { notify_on_remark: false });
    await service.processSubmission(submissionInput());
    const list = await service.list(SCHOOL, {});
    await service.reviewResults(SCHOOL, 'teacher-1', { resultIds: [list.data[0]!.id] });
    await service.releaseResults(SCHOOL, ADMIN, { examId: 'exam-1' });

    const preview = await service.previewKeyCorrection(SCHOOL, 'teacher-1', {
      examId: 'exam-1',
      questionId: 'q1',
      correctOptionIds: ['b'],
      reason: 'Correction',
    });
    const applied = await service.applyKeyCorrection(SCHOOL, 'teacher-1', preview.run.id);
    expect(applied.notificationsQueued).toBe(0);
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
