import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditController } from './audit.controller';
import { AuditService } from '../auth/audit/audit.service';
import type { AuthContext } from '../auth/domain/types';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';

const AUTH = { user: { id: 'user-1', schoolId: 'school-1', role: 'school_admin' }, session: {} };

function contextFor(schoolId: string | null, role = 'school_admin'): AuthContext {
  return {
    user: { id: 'user-1', schoolId, role },
    session: {},
  } as unknown as AuthContext;
}

describe('AuditController', () => {
  let app: INestApplication;
  const service = { query: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditService, useValue: service }],
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

  it('scopes a school user to their school and maps the page', async () => {
    service.query.mockResolvedValueOnce({ items: [{ id: 'a1', action: 'auth.login' }], nextCursor: 'a1' });

    const res = await request(app.getHttpServer())
      .get('/audit-logs?action=auth.login&limit=10')
      .expect(200);

    expect(res.body).toEqual({ data: [{ id: 'a1', action: 'auth.login' }], next_cursor: 'a1' });
    expect(service.query).toHaveBeenCalledWith({
      schoolId: 'school-1',
      actorId: undefined,
      action: 'auth.login',
      entity: undefined,
      from: undefined,
      to: undefined,
      cursor: undefined,
      limit: 10,
    });
  });

  it('gives the platform owner a cross-school view and parses the date filters', async () => {
    service.query.mockResolvedValueOnce({ items: [], nextCursor: null });
    const controller = new AuditController(service as unknown as AuditService);

    await controller.list(contextFor(null, 'platform_owner'), {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
      entity: 'result',
    });

    expect(service.query).toHaveBeenCalledWith({
      schoolId: undefined,
      actorId: undefined,
      action: undefined,
      entity: 'result',
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-02-01T00:00:00.000Z'),
      cursor: undefined,
      limit: undefined,
    });
  });
});
