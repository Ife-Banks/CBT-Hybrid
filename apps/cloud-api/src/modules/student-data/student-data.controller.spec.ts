import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { StudentDataController } from './student-data.controller';
import { StudentDataService } from './student-data.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';

const AUTH = { user: { id: 'user-1', schoolId: 'school-1', role: 'school_admin' }, session: {} };

describe('StudentDataController', () => {
  let app: INestApplication;
  const service = { dataExport: vi.fn(), anonymise: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StudentDataController],
      providers: [{ provide: StudentDataService, useValue: service }],
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
    service.dataExport.mockReset();
    service.anonymise.mockReset();
  });

  it('downloads the data export with attachment headers', async () => {
    service.dataExport.mockResolvedValueOnce({
      filename: 'student-A-001.zip',
      contentType: 'application/zip',
      body: Buffer.from('PK'),
    });

    const res = await request(app.getHttpServer())
      .post('/students/student-1/data-export')
      .expect(200);

    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toBe('attachment; filename="student-A-001.zip"');
    expect(service.dataExport).toHaveBeenCalledWith('school-1', 'user-1', 'school_admin', 'student-1');
  });

  it('returns the anonymisation summary', async () => {
    service.anonymise.mockResolvedValueOnce({
      id: 'student-1',
      anonymised_at: '2026-03-01T00:00:00.000Z',
      scores_retained: true,
    });

    const res = await request(app.getHttpServer())
      .post('/students/student-1/anonymise')
      .expect(200);

    expect(res.body).toEqual({
      id: 'student-1',
      anonymised_at: '2026-03-01T00:00:00.000Z',
      scores_retained: true,
    });
    expect(service.anonymise).toHaveBeenCalledWith('school-1', 'user-1', 'school_admin', 'student-1');
  });
});
