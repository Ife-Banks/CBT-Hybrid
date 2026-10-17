import { beforeEach, describe, expect, it } from 'vitest';
import { ResultsIntakeService } from './results-intake.service';
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

describe('ResultsIntakeService', () => {
  let submissions: InMemorySubmissionRepository;
  let results: InMemoryResultRepository;
  let directory: InMemoryDirectoryRepository;
  let intake: ResultsIntakeService;

  beforeEach(() => {
    submissions = new InMemorySubmissionRepository();
    results = new InMemoryResultRepository();
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
    directory.seedSitting({
      id: 'sitting-1',
      schoolId: SCHOOL,
      examId: 'exam-1',
      classId: 'class-1',
      status: 'closed',
    });
    const gradeScales = new GradeScaleService(new InMemoryGradeScaleRepository());
    const service = new ResultsService(
      results,
      submissions,
      new InMemoryRemarkRunRepository(),
      directory,
      gradeScales,
      new NotificationsService(new InMemoryNotificationRepository()),
    );
    intake = new ResultsIntakeService(service, submissions, directory);
  });

  it('creates a submission from session.started', async () => {
    const outcomes = await intake.processBatch('session.started', [
      {
        event_id: 'ev-1',
        payload: {
          session_id: 'session-1',
          sitting_id: 'sitting-1',
          exam_id: 'exam-1',
          student_id: 'student-1',
          pack_version: 1,
          seat: 'B12',
          started_at: '2026-10-20T09:00:00.000Z',
        },
      },
    ]);
    expect(outcomes).toEqual([{ event_id: 'ev-1', outcome: 'accepted' }]);
    const submission = await submissions.findById('session-1');
    expect(submission?.seat).toBe('B12');
    expect(submission?.classId).toBe('class-1');
  });

  it('marks a submission from session.submitted', async () => {
    const outcomes = await intake.processBatch('session.submitted', [
      {
        event_id: 'ev-2',
        payload: {
          session_id: 'session-1',
          sitting_id: 'sitting-1',
          exam_id: 'exam-1',
          student_id: 'student-1',
          pack_version: 1,
          submitted_at: '2026-10-20T09:41:12.000Z',
          submit_reason: 'student',
          integrity: { focus_lost_count: 1 },
          answers: [{ question_id: 'q1', answer: { option_id: 'a' }, seq: 1 }],
        },
      },
    ]);
    expect(outcomes).toEqual([{ event_id: 'ev-2', outcome: 'accepted' }]);
    const result = await results.findBySubmissionId('session-1');
    expect(result?.score).toBe(2);
    expect(result?.status).toBe('draft');
    expect(result?.grade).toBe('A');
  });

  it('records the school score from session.scored', async () => {
    await intake.processBatch('session.submitted', [
      {
        event_id: 'ev-2',
        payload: {
          session_id: 'session-1',
          sitting_id: 'sitting-1',
          exam_id: 'exam-1',
          student_id: 'student-1',
          pack_version: 1,
          answers: [{ question_id: 'q1', answer: { option_id: 'a' } }],
        },
      },
    ]);
    const outcomes = await intake.processBatch('session.scored', [
      { event_id: 'ev-3', payload: { session_id: 'session-1', score: 2, max_score: 2, key_version: 1 } },
    ]);
    expect(outcomes).toEqual([{ event_id: 'ev-3', outcome: 'accepted' }]);
    const submission = await submissions.findById('session-1');
    expect(submission?.schoolScore).toBe(2);
  });

  it('voids a submission on session.reset', async () => {
    await intake.processBatch('session.submitted', [
      {
        event_id: 'ev-2',
        payload: {
          session_id: 'session-1',
          sitting_id: 'sitting-1',
          exam_id: 'exam-1',
          student_id: 'student-1',
          pack_version: 1,
          answers: [{ question_id: 'q1', answer: { option_id: 'a' } }],
        },
      },
    ]);
    await intake.processBatch('session.reset', [
      { event_id: 'ev-4', payload: { session_id: 'session-1', reason: 'crash' } },
    ]);
    expect(await submissions.findById('session-1')).toMatchObject({ status: 'voided' });
    expect(await results.list({ schoolId: SCHOOL })).toHaveLength(0);
  });

  it('reports duplicate event ids as duplicate', async () => {
    const events = [
      { event_id: 'ev-9', payload: { session_id: 'session-9', sitting_id: 'sitting-1', exam_id: 'exam-1', student_id: 'student-1', pack_version: 1 } },
    ];
    await intake.processBatch('session.started', events);
    const second = await intake.processBatch('session.started', events);
    expect(second).toEqual([{ event_id: 'ev-9', outcome: 'duplicate' }]);
  });

  it('acknowledges unknown event types', async () => {
    const outcomes = await intake.processBatch('sitting.opened', [{ event_id: 'ev-10' }]);
    expect(outcomes).toEqual([{ event_id: 'ev-10', outcome: 'accepted' }]);
  });

  it('rejects events for an unknown sitting', async () => {
    const outcomes = await intake.processBatch('session.started', [
      {
        event_id: 'ev-11',
        payload: {
          session_id: 'session-x',
          sitting_id: 'missing',
          exam_id: 'exam-1',
          student_id: 'student-1',
          pack_version: 1,
        },
      },
    ]);
    expect(outcomes[0]).toMatchObject({ outcome: 'rejected', code: 'SITTING_UNKNOWN' });
  });

  it('rejects payloads with no ids', async () => {
    const outcomes = await intake.processBatch('session.submitted', [{ event_id: 'ev-12' }]);
    expect(outcomes[0]).toMatchObject({ outcome: 'rejected', code: 'PAYLOAD_INVALID' });
  });
});
