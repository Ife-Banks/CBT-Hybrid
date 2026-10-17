import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';

const AUTH = { user: { id: 'user-1', schoolId: 'school-1', role: 'teacher' }, session: {} };

describe('ResultsController', () => {
  let app: INestApplication;
  const service = {
    list: vi.fn(),
    getDetail: vi.fn(),
    reviewResults: vi.fn(),
    releaseResults: vi.fn(),
    withdrawResults: vi.fn(),
    markAnswer: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ResultsController],
      providers: [
        { provide: ResultsService, useValue: service },
        IdempotencyService,
        IdempotencyInterceptor,
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AbilitiesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.use((req: { auth?: unknown }, _res: unknown, next: () => void) => {
      req.auth = AUTH;
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists results scoped to the caller school with pagination metadata', async () => {
    service.list.mockResolvedValueOnce({
      data: [{ id: 'result-1' }],
      nextCursor: 'result-1',
      lastSyncedAt: null,
    });
    const res = await request(app.getHttpServer())
      .get('/results?exam_id=exam-1')
      .expect(200);
    expect(res.body).toEqual({ data: [{ id: 'result-1' }], next_cursor: 'result-1', last_synced_at: null });
    expect(service.list).toHaveBeenCalledWith(
      'school-1',
      { examId: 'exam-1', classId: undefined, status: undefined, studentId: undefined },
      { cursor: undefined, limit: undefined },
    );
  });

  it('releases results with the caller actor', async () => {
    service.releaseResults.mockResolvedValueOnce({ released: 2, notificationsQueued: 2 });
    const res = await request(app.getHttpServer())
      .post('/results/release')
      .send({ exam_id: 'exam-1' })
      .expect(201);
    expect(res.body).toEqual({ released: 2, notificationsQueued: 2 });
    expect(service.releaseResults).toHaveBeenCalledWith(
      'school-1',
      { id: 'user-1', role: 'teacher' },
      { resultIds: undefined, examId: 'exam-1', classId: undefined },
      { notify: undefined },
    );
  });

  it('replays the first response for a repeated Idempotency-Key', async () => {
    service.releaseResults.mockResolvedValueOnce({ released: 1, notificationsQueued: 1 });
    const first = await request(app.getHttpServer())
      .post('/results/release')
      .set('Idempotency-Key', 'key-1')
      .send({ exam_id: 'exam-1' })
      .expect(201);
    expect(first.body).toEqual({ released: 1, notificationsQueued: 1 });

    const second = await request(app.getHttpServer())
      .post('/results/release')
      .set('Idempotency-Key', 'key-1')
      .send({ exam_id: 'exam-1' })
      .expect(201);
    expect(second.body).toEqual({ released: 1, notificationsQueued: 1 });
    expect(service.releaseResults).toHaveBeenCalledTimes(1);
  });

  it('hand-marks a single answer', async () => {
    service.markAnswer.mockResolvedValueOnce({ id: 'result-1', score: 9 });
    const res = await request(app.getHttpServer())
      .post('/results/result-1/answers/q3/marks')
      .send({ marks: 5 })
      .expect(201);
    expect(res.body).toEqual({ id: 'result-1', score: 9 });
    expect(service.markAnswer).toHaveBeenCalledWith('school-1', 'user-1', 'result-1', 'q3', { marks: 5 });
  });
});
