import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '../../common/config/config.service';
import { SessionService } from './session.service';
import { InMemorySessionRepository } from './repositories/session.repository';
import type { RequestContext, UserRecord } from './domain/types';
import { FakeClock } from './testing/auth.fixture';

const context: RequestContext = {
  ip: '203.0.113.10',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36',
  requestId: 'req-1',
};

function user(role: UserRecord['role'], id = 'user-1'): UserRecord {
  return { id, role } as UserRecord;
}

describe('SessionService', () => {
  let clock: FakeClock;
  let repository: InMemorySessionRepository;
  let sessions: SessionService;

  beforeEach(() => {
    clock = new FakeClock();
    repository = new InMemorySessionRepository();
    sessions = new SessionService(new ConfigService(), repository, clock);
  });

  it('issues an opaque token and stores only its hash', async () => {
    const issued = await sessions.create(user('school_admin'), context);
    expect(issued.token.length).toBeGreaterThan(20);
    expect(issued.session.tokenHash).not.toBe(issued.token);
    expect(issued.session.userAgent).toContain('Chrome');
    expect(issued.session.revokedAt).toBeNull();
  });

  it('uses 12h for staff and 30d for parents', async () => {
    const staff = await sessions.create(user('teacher'), context);
    expect(staff.ttlSeconds).toBe(12 * 60 * 60);
    expect(staff.session.sliding).toBe(false);

    const parent = await sessions.create(user('parent', 'user-2'), context);
    expect(parent.ttlSeconds).toBe(30 * 24 * 60 * 60);
    expect(parent.session.sliding).toBe(true);
  });

  it('resolves a live session from the token and rejects a revoked one', async () => {
    const issued = await sessions.create(user('school_admin'), context);
    const found = await sessions.findByToken(issued.token);
    expect(found?.id).toBe(issued.session.id);

    await sessions.revoke(issued.session);
    expect(await sessions.findByToken(issued.token)).toBeNull();
  });

  it('expires a staff session after its lifetime', async () => {
    const issued = await sessions.create(user('school_admin'), context);
    clock.advanceMs(12 * 60 * 60 * 1000 + 1);
    expect(await sessions.findByToken(issued.token)).toBeNull();
  });

  it('slides a parent session on activity', async () => {
    const issued = await sessions.create(user('parent', 'user-2'), context);
    const originalExpiry = issued.session.expiresAt.getTime();

    clock.advanceMs(24 * 60 * 60 * 1000);
    const live = await sessions.findByToken(issued.token);
    expect(live).not.toBeNull();
    await sessions.touch(live!);

    const refreshed = await sessions.findById(issued.session.id);
    expect(refreshed!.expiresAt.getTime()).toBeGreaterThan(originalExpiry);
  });

  it('does not slide a staff session', async () => {
    const issued = await sessions.create(user('teacher'), context);
    const originalExpiry = issued.session.expiresAt.getTime();
    clock.advanceMs(60 * 60 * 1000);
    const live = await sessions.findByToken(issued.token);
    await sessions.touch(live!);
    const refreshed = await sessions.findById(issued.session.id);
    expect(refreshed!.expiresAt.getTime()).toBe(originalExpiry);
  });

  it('revokes every session but the current one', async () => {
    const first = await sessions.create(user('teacher'), context);
    await sessions.create(user('teacher'), context);
    await sessions.create(user('teacher'), context);

    const revoked = await sessions.revokeAllForUser('user-1', first.session.id);
    expect(revoked).toBe(2);
    expect(await sessions.findByToken(first.token)).not.toBeNull();
  });

  it('derives a stable CSRF token bound to the session id', async () => {
    const issued = await sessions.create(user('school_admin'), context);
    const token = sessions.csrfTokenFor(issued.session.id);
    expect(token).toBe(issued.csrfToken);
    expect(sessions.csrfMatches(issued.session.id, token)).toBe(true);
    expect(sessions.csrfMatches(issued.session.id, 'tampered')).toBe(false);
    expect(sessions.csrfMatches('other-session', token)).toBe(false);
    expect(sessions.csrfMatches(issued.session.id, undefined)).toBe(false);
  });
});
