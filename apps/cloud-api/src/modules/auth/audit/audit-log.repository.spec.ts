import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryAuditLogRepository,
  decodeAuditCursor,
  encodeAuditCursor,
  type AuditLogRecord,
} from './audit-log.repository';

function entry(overrides: Partial<AuditLogRecord> & { id: string; at: string }): AuditLogRecord {
  return {
    schoolId: 'school-1',
    actorUserId: null,
    actorRole: null,
    action: 'auth.login',
    outcome: 'success',
    entityType: null,
    entityId: null,
    ip: null,
    userAgent: null,
    requestId: null,
    detail: null,
    ...overrides,
  };
}

describe('audit log cursor', () => {
  it('round-trips a cursor', () => {
    const cursor = encodeAuditCursor({ at: '2026-01-02T03:04:05.000Z', id: 'abc' });
    expect(decodeAuditCursor(cursor)).toEqual({ at: '2026-01-02T03:04:05.000Z', id: 'abc' });
  });

  it('rejects a malformed cursor', () => {
    expect(decodeAuditCursor('not-a-cursor')).toBeNull();
    expect(decodeAuditCursor(Buffer.from('nodivider', 'utf8').toString('base64url'))).toBeNull();
  });
});

describe('InMemoryAuditLogRepository', () => {
  let repository: InMemoryAuditLogRepository;

  beforeEach(() => {
    repository = new InMemoryAuditLogRepository();
  });

  it('returns newest first and paginates with a stable cursor', async () => {
    await repository.insert(entry({ id: 'a', at: '2026-01-01T00:00:00.000Z' }));
    await repository.insert(entry({ id: 'b', at: '2026-01-02T00:00:00.000Z' }));
    await repository.insert(entry({ id: 'c', at: '2026-01-03T00:00:00.000Z' }));

    const first = await repository.query({ schoolId: 'school-1', limit: 2 });
    expect(first.items.map((row) => row.id)).toEqual(['c', 'b']);
    expect(first.nextCursor).toBeTruthy();

    const second = await repository.query({
      schoolId: 'school-1',
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((row) => row.id)).toEqual(['a']);
    expect(second.nextCursor).toBeNull();
  });

  it('filters by school, actor, action, entity and date range', async () => {
    await repository.insert(
      entry({
        id: 'a',
        at: '2026-01-01T00:00:00.000Z',
        action: 'results.released',
        actorUserId: 'u1',
        entityType: 'result',
      }),
    );
    await repository.insert(
      entry({
        id: 'b',
        at: '2026-02-01T00:00:00.000Z',
        action: 'results.reviewed',
        actorUserId: 'u2',
        entityType: 'result',
      }),
    );
    await repository.insert(
      entry({
        id: 'c',
        at: '2026-02-02T00:00:00.000Z',
        action: 'results.released',
        actorUserId: 'u1',
        entityType: 'result',
        schoolId: 'school-2',
      }),
    );

    const ids = async (filter: Parameters<typeof repository.query>[0]) =>
      (await repository.query(filter)).items.map((row) => row.id);

    expect(await ids({ schoolId: 'school-1', actorId: 'u1' })).toEqual(['a']);
    expect(await ids({ schoolId: 'school-1', action: 'results.reviewed' })).toEqual(['b']);
    expect(await ids({ schoolId: 'school-1', entity: 'result' })).toEqual(['b', 'a']);
    expect(await ids({ schoolId: 'school-1', from: new Date('2026-02-01T00:00:00.000Z') })).toEqual(['b']);
    expect(await ids({ schoolId: 'school-1', to: new Date('2026-01-01T00:00:00.000Z') })).toEqual(['a']);
    expect(await ids({ actorId: 'u1' })).toEqual(['c', 'a']);
  });

  it('lists a single school oldest first for export', async () => {
    await repository.insert(entry({ id: 'a', at: '2026-01-02T00:00:00.000Z', action: 'x' }));
    await repository.insert(entry({ id: 'b', at: '2026-01-01T00:00:00.000Z', action: 'y' }));
    await repository.insert(entry({ id: 'c', at: '2026-01-01T00:00:00.000Z', action: 'z', schoolId: 'school-2' }));

    const rows = await repository.listForExport('school-1');
    expect(rows.map((row) => row.id)).toEqual(['b', 'a']);
  });
});
