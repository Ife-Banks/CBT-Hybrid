import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { eq, sql } from 'drizzle-orm';
import {
  ExamCrypto,
  StudentCodeGenerator,
  StudentCodeValidator,
  buildPack,
  hashExamKey,
  type BuildPackInput,
} from '@cbt/exam-core';
import { AppModule } from '../../app.module';
import { DrizzleSqliteService } from '../../shared/database/drizzle-sqlite.service';
import * as schema from '../../shared/database/schema';
import { PackImportService } from './pack-import.service';
import { ExamSessionService } from './exam-session.service';

const crypto = new ExamCrypto();
const { privateKeyPem, publicKeyPem } = crypto.generateSigningKeyPair();
const PACK_KEY = new Uint8Array(32).fill(5);

const SCHOOL_ID = 'school-1';
const CLASS_ID = 'class-1';
const STUDENT_ID = 'student-1';
const STUDENT_CODE = `GRA-${new StudentCodeGenerator().generateCodeBody()}`;
const SITTING_ID = 'sitting-1';
const EXAM_ID = 'exam-1';
const EXAM_KEY = '482913';
const SEAT = 'PC-12';

function packInput(): BuildPackInput {
  return {
    packId: 'pack-1',
    schoolId: SCHOOL_ID,
    examId: EXAM_ID,
    version: 1,
    packKey: PACK_KEY,
    signingPrivateKeyPem: privateKeyPem,
    signingKeyId: 'ps-2026-1',
    builtAt: '2026-10-18T14:02:11.000Z',
    exam: {
      title: 'JSS 2 Mathematics',
      subject: { id: 'sub-1', name: 'Mathematics' },
      section: 'secondary',
      durationMin: 60,
      instructionsHtml: '<p>Answer all questions.</p>',
      shuffleQuestions: true,
      shuffleOptions: true,
      showScoreToStudent: true,
    },
    questions: [
      {
        questionId: 'q-1',
        position: 1,
        type: 'single_choice',
        stem: '<p>What is 2^3?</p>',
        marks: 2,
        options: [
          { id: 'opt-a', label: 'A', body: '6', sortOrder: 1 },
          { id: 'opt-b', label: 'B', body: '8', sortOrder: 2 },
        ],
        correctOptionIds: ['opt-b'],
      },
      {
        questionId: 'q-2',
        position: 2,
        type: 'fill_blank',
        stem: '<p>The capital of Nigeria is ____.</p>',
        marks: 2,
        fillAnswers: { answers: ['Abuja'], caseSensitive: false },
      },
    ],
  };
}

describe('exam delivery API (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataDir: string;
  let db: ReturnType<DrizzleSqliteService['getDb']>;
  let sessions: ExamSessionService;

  let ticket: string;
  let sessionToken: string;
  let sessionId: string;
  let questionOrder: string[];

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'cbt-exam-'));
    process.env.CBT_DATA_DIR = dataDir;
    process.env.NODE_ENV = 'test';
    process.env.TICKET_SIGNING_SECRET = 'e2e-ticket-secret-0123456789';

    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(helmet());
    await app.init();

    db = moduleRef.get(DrizzleSqliteService).getDb();
    sessions = moduleRef.get(ExamSessionService);

    // Device identity that pack verification and status reporting read.
    db.insert(schema.meta)
      .values([
        { key: 'school_id', value: SCHOOL_ID },
        { key: 'school_name', value: 'Graceland College' },
        { key: 'cloud_public_key', value: publicKeyPem },
      ])
      .run();

    const built = buildPack(packInput());
    await moduleRef.get(PackImportService).importPack({ bytes: built.bytes, packKey: PACK_KEY });

    db.insert(schema.classes)
      .values({ id: CLASS_ID, name: 'JSS 2 Gold', section: 'secondary' })
      .run();
    db.insert(schema.students)
      .values({
        id: STUDENT_ID,
        code: STUDENT_CODE,
        codeStatus: 'active',
        fullName: 'Tunde Bello',
        classId: CLASS_ID,
        section: 'secondary',
        syncedAt: '2026-10-18T00:00:00.000Z',
      })
      .run();
    db.insert(schema.sittings)
      .values({
        id: SITTING_ID,
        examId: EXAM_ID,
        classId: CLASS_ID,
        packId: 'pack-1',
        windowStart: new Date(Date.now() - 60_000).toISOString(),
        windowEnd: new Date(Date.now() + 7_200_000).toISOString(),
        examKeyHash: hashExamKey(SITTING_ID, EXAM_KEY),
        status: 'open',
        syncedAt: '2026-10-18T00:00:00.000Z',
      })
      .run();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.CBT_DATA_DIR;
    delete process.env.TICKET_SIGNING_SECRET;
  });

  it('the fixture student code is well formed', () => {
    expect(new StudentCodeValidator().validateCode(STUDENT_CODE)).toBe(true);
  });

  it('GET /status reports the school, open sittings and time', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/exam/status').expect(200);

    expect(res.body.school_name).toBe('Graceland College');
    expect(res.body.open_sittings).toBe(1);
    expect(Number.isNaN(Date.parse(res.body.server_time))).toBe(false);
    // Never leaks student or exam names.
    expect(JSON.stringify(res.body)).not.toContain('Tunde');
  });

  it('POST /login rejects a wrong exam key', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/exam/login')
      .send({ student_code: STUDENT_CODE, exam_key: '000000' })
      .expect(401);

    expect(res.body.code).toBe('KEY_INVALID');
  });

  it('POST /login rejects a malformed student code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/exam/login')
      .send({ student_code: 'nope', exam_key: EXAM_KEY })
      .expect(422);

    expect(res.body.code).toBe('CODE_FORMAT_INVALID');
  });

  it('POST /login returns a ready ticket for a valid code and key', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/exam/login')
      .send({ student_code: STUDENT_CODE, exam_key: EXAM_KEY, seat: SEAT })
      .expect(201);

    expect(res.body.state).toBe('ready');
    expect(res.body.student.full_name).toBe('Tunde Bello');
    expect(res.body.student.class_name).toBe('JSS 2 Gold');
    expect(res.body.exam.title).toBe('JSS 2 Mathematics');
    expect(res.body.ticket).toBeTruthy();
    ticket = res.body.ticket as string;
  });

  it('POST /start needs the ticket and creates the session', async () => {
    await request(app.getHttpServer()).post('/api/v1/exam/start').expect(401);

    const res = await request(app.getHttpServer())
      .post('/api/v1/exam/start')
      .set('Authorization', `Bearer ${ticket}`)
      .expect(201);

    expect(res.body.session_token).toBeTruthy();
    expect(res.body.seq).toBe(0);
    expect(res.body.remaining_ms).toBeGreaterThan(0);
    expect(res.body.remaining_ms).toBeLessThanOrEqual(60 * 60 * 1000);

    sessionToken = res.body.session_token as string;
    sessionId = res.body.session_id as string;

    const ids = (res.body.questions as Array<{ question_id: string }>).map((q) => q.question_id);
    expect([...ids].sort()).toEqual(['q-1', 'q-2']);
    questionOrder = ids;
  });

  it('GET /session returns the same, seed-determined order', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/exam/session')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(200);

    expect(res.body.status).toBe('in_progress');
    expect(res.body.answers).toEqual([]);
    const ids = (res.body.questions as Array<{ question_id: string }>).map((q) => q.question_id);
    expect(ids).toEqual(questionOrder);
  });

  it('PUT /session/answers stores a batch and acknowledges its seq', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/exam/session/answers')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({
        seq: 1,
        changes: [
          { question_id: 'q-1', answer: { option_id: 'opt-b' }, flagged: false },
          { question_id: 'q-2', answer: { text: 'abuja' }, flagged: true },
          { question_id: 'unknown', answer: { option_id: 'x' }, flagged: false },
        ],
      })
      .expect(200);

    expect(res.body.ack_seq).toBe(1);
    expect(res.body.status).toBe('in_progress');
  });

  it('ignores an out-of-order auto-save', async () => {
    // A lower seq must not roll the stored answer back (the answers trigger).
    const res = await request(app.getHttpServer())
      .put('/api/v1/exam/session/answers')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({ seq: 0, changes: [{ question_id: 'q-1', answer: { option_id: 'opt-a' } }] })
      .expect(200);

    expect(res.body.ack_seq).toBe(1);

    const read = await request(app.getHttpServer())
      .get('/api/v1/exam/session')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(200);

    const answer = (read.body.answers as Array<{ question_id: string; answer: unknown; flagged: boolean }>).find(
      (entry) => entry.question_id === 'q-1',
    );
    expect(answer?.answer).toEqual({ option_id: 'opt-b' });
  });

  it('POST /ping reports the remaining time', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/exam/ping')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(201);

    expect(res.body.status).toBe('in_progress');
    expect(res.body.remaining_ms).toBeGreaterThan(0);
  });

  it('POST /session/submit marks the session and returns the score', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/exam/session/submit')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({ seq: 2, changes: [] })
      .expect(201);

    expect(res.body.status).toBe('submitted');
    expect(res.body.score).toEqual({ score: 4, max_score: 4, percent: 100 });
  });

  it('records the result and queues the sync events', () => {
    const [result] = db.select().from(schema.results).all();
    expect(result?.score).toBe(4);
    expect(result?.maxScore).toBe(4);
    expect(result?.percent).toBe(100);

    const [session] = db.select().from(schema.examSessions).all();
    expect(session?.status).toBe('submitted');
    expect(session?.submitReason).toBe('student');
    expect(session?.lastSeq).toBe(2);

    const types = db
      .select({ type: schema.outbox.type })
      .from(schema.outbox)
      .all()
      .map((row) => row.type);
    expect(types).toContain('session.started');
    expect(types).toContain('session.submitted');
    expect(types).toContain('session.scored');
  });

  it('returns SESSION_CLOSED for writes after submission, and reports the status on ping', async () => {
    const read = await request(app.getHttpServer())
      .get('/api/v1/exam/session')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(409);
    expect(read.body.code).toBe('SESSION_CLOSED');

    const answers = await request(app.getHttpServer())
      .put('/api/v1/exam/session/answers')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({ seq: 3, changes: [{ question_id: 'q-1', answer: { option_id: 'opt-a' } }] })
      .expect(409);
    expect(answers.body.code).toBe('SESSION_CLOSED');

    const submit = await request(app.getHttpServer())
      .post('/api/v1/exam/session/submit')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({ seq: 3, changes: [] })
      .expect(409);
    expect(submit.body.code).toBe('SESSION_CLOSED');

    // Ping still answers so a client that was offline learns the session ended
    // (API spec 16.7 reports `status`).
    const ping = await request(app.getHttpServer())
      .post('/api/v1/exam/ping')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(201);
    expect(ping.body.status).toBe('submitted');
  });

  it('refuses a second attempt for the same student and exam', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/exam/login')
      .send({ student_code: STUDENT_CODE, exam_key: EXAM_KEY, seat: SEAT })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/exam/start')
      .set('Authorization', `Bearer ${login.body.ticket}`)
      .expect(409);

    expect(res.body.code).toBe('ALREADY_SUBMITTED');
  });

  it('locks a seat after five failed logins', async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/exam/login')
        .send({ student_code: STUDENT_CODE, exam_key: '000000', seat: 'PC-99' })
        .expect(401);
      expect(res.body.code).toBe('KEY_INVALID');
    }

    const locked = await request(app.getHttpServer())
      .post('/api/v1/exam/login')
      .send({ student_code: STUDENT_CODE, exam_key: EXAM_KEY, seat: 'PC-99' })
      .expect(429);
    expect(locked.body.code).toBe('SEAT_LOCKED');
  });

  it('resumes a live session and stops the old token working', async () => {
    const code = `GRA-${new StudentCodeGenerator().generateCodeBody()}`;
    db.insert(schema.students)
      .values({
        id: 'student-3',
        code,
        codeStatus: 'active',
        fullName: 'Chidi Eze',
        classId: CLASS_ID,
        section: 'secondary',
        syncedAt: '2026-10-18T00:00:00.000Z',
      })
      .run();

    const first = await request(app.getHttpServer())
      .post('/api/v1/exam/login')
      .send({ student_code: code, exam_key: EXAM_KEY, seat: 'PC-14' })
      .expect(201);
    const started = await request(app.getHttpServer())
      .post('/api/v1/exam/start')
      .set('Authorization', `Bearer ${first.body.ticket}`)
      .expect(201);
    const firstToken = started.body.session_token as string;

    // Logging in again while the session is live rotates the token.
    const second = await request(app.getHttpServer())
      .post('/api/v1/exam/login')
      .send({ student_code: code, exam_key: EXAM_KEY, seat: 'PC-14' })
      .expect(201);
    expect(second.body.state).toBe('in_progress');
    const secondToken = second.body.session_token as string;
    expect(second.body.session_id).toBe(started.body.session_id);

    await request(app.getHttpServer())
      .get('/api/v1/exam/session')
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(401);

    const resumed = await request(app.getHttpServer())
      .get('/api/v1/exam/session')
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200);
    expect(resumed.body.session_id).toBe(started.body.session_id);
  });

  it('expires overdue sessions server-side with reason time_up', async () => {
    db.insert(schema.students)
      .values({
        id: 'student-2',
        code: 'GRA-BBBBBBBBC',
        codeStatus: 'active',
        fullName: 'Ada Obi',
        classId: CLASS_ID,
        section: 'secondary',
        syncedAt: '2026-10-18T00:00:00.000Z',
      })
      .run();
    db.insert(schema.examSessions)
      .values({
        id: 'overdue-session',
        sittingId: SITTING_ID,
        studentId: 'student-2',
        seat: 'PC-13',
        tokenHash: 'overdue-token-hash',
        seed: 7,
        startedAt: new Date(Date.now() - 3_600_000).toISOString(),
        endsAt: new Date(Date.now() - 60_000).toISOString(),
        status: 'in_progress',
      })
      .run();

    const summary = await sessions.expireDue();

    expect(summary.time_up).toBe(1);
    const [overdue] = db
      .select()
      .from(schema.examSessions)
      .where(eq(schema.examSessions.id, 'overdue-session'))
      .all();
    expect(overdue?.status).toBe('submitted');
    expect(overdue?.submitReason).toBe('time_up');

    const scoredRows = db
      .select({ value: sql<number>`count(*)` })
      .from(schema.outbox)
      .where(eq(schema.outbox.type, 'session.scored'))
      .all();
    expect(scoredRows[0]?.value).toBe(2);
  });
});
