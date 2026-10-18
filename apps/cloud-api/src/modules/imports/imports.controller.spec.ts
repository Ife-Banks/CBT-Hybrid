import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';

const AUTH = { user: { id: 'user-1', schoolId: 'school-1', role: 'school_admin' }, session: {} };

describe('ImportsController', () => {
  let app: INestApplication;
  const service = {
    getTemplate: vi.fn(),
    createJob: vi.fn(),
    listJobs: vi.fn(),
    getJob: vi.fn(),
    listRows: vi.fn(),
    fixRow: vi.fn(),
    skipRow: vi.fn(),
    confirm: vi.fn(),
    report: vi.fn(),
    cancel: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ImportsController],
      providers: [{ provide: ImportsService, useValue: service }],
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

  beforeEach(() => {
    for (const fn of Object.values(service)) fn.mockReset();
  });

  it('accepts a multipart upload and returns 202', async () => {
    service.createJob.mockResolvedValueOnce({ id: 'job-1', status: 'queued' });

    const res = await request(app.getHttpServer())
      .post('/imports')
      .field('kind', 'questions')
      .attach('file', Buffer.from('subject,question\n'), { filename: 'questions.csv', contentType: 'text/csv' })
      .expect(202);

    expect(res.body).toEqual({ id: 'job-1', status: 'queued' });
    expect(service.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        kind: 'questions',
        format: 'csv',
        uploadedBy: 'user-1',
      }),
    );
  });

  it('rejects an upload with no file', async () => {
    await request(app.getHttpServer()).post('/imports').field('kind', 'questions').expect(400);
  });

  it('downloads a template', async () => {
    service.getTemplate.mockReturnValueOnce({
      filename: 'questions-template.csv',
      contentType: 'text/csv',
      body: Buffer.from('a,b\n'),
    });

    const res = await request(app.getHttpServer()).get('/imports/templates/questions.csv').expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(service.getTemplate).toHaveBeenCalledWith('questions', 'csv');
  });

  it('confirms a job', async () => {
    service.confirm.mockResolvedValueOnce({ created: 2, skipped: 0, fixed: 0, report_url: '/imports/job-1/report.csv' });
    const res = await request(app.getHttpServer()).post('/imports/job-1/confirm').expect(200);
    expect(res.body.created).toBe(2);
    expect(service.confirm).toHaveBeenCalledWith('school-1', 'job-1', 'user-1');
  });

  it('fixes a row', async () => {
    service.fixRow.mockResolvedValueOnce({ id: 'row-1', status: 'ok' });
    await request(app.getHttpServer())
      .patch('/imports/job-1/rows/row-1')
      .send({ parsed: { correct: 'B' } })
      .expect(200);
    expect(service.fixRow).toHaveBeenCalledWith('school-1', 'job-1', 'row-1', { correct: 'B' });
  });

  it('cancels a job', async () => {
    service.cancel.mockResolvedValueOnce(undefined);
    await request(app.getHttpServer()).delete('/imports/job-1').expect(204);
    expect(service.cancel).toHaveBeenCalledWith('school-1', 'job-1');
  });
});
