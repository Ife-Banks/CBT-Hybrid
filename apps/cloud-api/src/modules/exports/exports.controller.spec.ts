import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';

const AUTH = { user: { id: 'user-1', schoolId: 'school-1', role: 'school_admin' }, session: {} };

describe('ExportsController', () => {
  let app: INestApplication;
  const service = { build: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ExportsController],
      providers: [{ provide: ExportsService, useValue: service }],
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
    service.build.mockReset();
  });

  it('splits <name>.<ext>, downloads the file and passes the actor context', async () => {
    service.build.mockResolvedValueOnce({
      filename: 'students.csv',
      contentType: 'text/csv; charset=utf-8',
      body: Buffer.from('Admission No\r\nA-001\r\n'),
    });

    const res = await request(app.getHttpServer()).get('/exports/students.csv').expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe('attachment; filename="students.csv"');
    expect(service.build).toHaveBeenCalledWith('students', 'csv', {
      schoolId: 'school-1',
      actorId: 'user-1',
      actorRole: 'school_admin',
    });
  });

  it('rejects a path without an extension', async () => {
    await request(app.getHttpServer()).get('/exports/students').expect(400);
    expect(service.build).not.toHaveBeenCalled();
  });
});
