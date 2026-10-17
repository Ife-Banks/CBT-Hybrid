import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';

const AUTH = { user: { id: 'user-1', schoolId: 'school-1', role: 'teacher' }, session: {} };

describe('ResultsController', () => {
  let app: INestApplication;
  const service = {
    list: vi.fn(),
    getDetail: vi.fn(),
    reviewResults: vi.fn(),
    releaseResults: vi.fn(),
    withdrawResults: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ResultsController],
      providers: [{ provide: ResultsService, useValue: service }],
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

  it('lists results scoped to the caller school', async () => {
    service.list.mockResolvedValueOnce([{ id: 'result-1' }]);
    const res = await request(app.getHttpServer())
      .get('/results?exam_id=exam-1')
      .expect(200);
    expect(res.body).toEqual({ data: [{ id: 'result-1' }] });
    expect(service.list).toHaveBeenCalledWith('school-1', {
      examId: 'exam-1',
      classId: undefined,
      status: undefined,
      studentId: undefined,
    });
  });

  it('releases results', async () => {
    service.releaseResults.mockResolvedValueOnce({ released: 2, notificationsQueued: 2 });
    const res = await request(app.getHttpServer())
      .post('/results/release')
      .send({ exam_id: 'exam-1' })
      .expect(201);
    expect(res.body).toEqual({ released: 2, notificationsQueued: 2 });
    expect(service.releaseResults).toHaveBeenCalledWith(
      'school-1',
      'user-1',
      { resultIds: undefined, examId: 'exam-1', classId: undefined },
      { notify: undefined },
    );
  });
});
