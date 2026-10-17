import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from './audit.service';
import { InMemoryAuditLogRepository, type AuditLogRepository } from './audit-log.repository';
import { LoggerService } from '../../../shared/logger/logger.service';

describe('AuditService', () => {
  let repository: InMemoryAuditLogRepository;
  let service: AuditService;

  beforeEach(() => {
    repository = new InMemoryAuditLogRepository();
    service = new AuditService(new LoggerService(), repository);
  });

  it('records an event to the buffer and the store', async () => {
    service.record({
      action: 'results.released',
      outcome: 'success',
      actorUserId: 'u1',
      actorRole: 'school_admin',
      schoolId: 'school-1',
      targetType: 'result',
      targetId: 'r1',
      detail: { released: 3 },
    });

    expect(service.list()).toHaveLength(1);
    const page = await service.query({ schoolId: 'school-1' });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      action: 'results.released',
      outcome: 'success',
      actorUserId: 'u1',
      actorRole: 'school_admin',
      entityType: 'result',
      entityId: 'r1',
      detail: { released: 3 },
    });
  });

  it('queries from the in-memory buffer when no store is injected', async () => {
    const bare = new AuditService(new LoggerService());
    bare.record({ action: 'auth.login', outcome: 'success', schoolId: 'school-1' });

    const page = await bare.query({ schoolId: 'school-1' });
    expect(page.items[0]?.action).toBe('auth.login');
  });

  it('exports only the entries for one school', async () => {
    service.record({ action: 'a', outcome: 'success', schoolId: 'school-1' });
    service.record({ action: 'b', outcome: 'success', schoolId: 'school-2' });

    const rows = await service.listForExport('school-1');
    expect(rows.map((row) => row.action)).toEqual(['a']);
  });

  it('never throws when persistence fails', () => {
    const failing = {
      insert: vi.fn().mockRejectedValue(new Error('db down')),
      query: vi.fn(),
      listForExport: vi.fn(),
    } as unknown as AuditLogRepository;
    const tolerant = new AuditService(new LoggerService(), failing);

    expect(() => tolerant.record({ action: 'x', outcome: 'success' })).not.toThrow();
    expect(tolerant.list()).toHaveLength(1);
  });
});
