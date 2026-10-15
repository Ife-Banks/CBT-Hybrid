import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { sha256Hex } from '@cbt/exam-core';
import { uuidv7 } from '@cbt/shared-types';
import type { Role } from '@cbt/shared-types';
import { ConfigService } from '../../common/config/config.service';
import { RequestContext, SessionRecord, UserRecord } from './domain/types';
import { SESSION_REPOSITORY, SessionRepository } from './repositories/session.repository';
import { ClockService } from './clock.service';

/** Issued session: the raw token goes in the cookie, only its hash is stored. */
export interface IssuedSession {
  session: SessionRecord;
  /** Raw 32-byte token for the `cbt_session` cookie. Never persisted. */
  token: string;
  /** Double-submit token for the `cbt_csrf` cookie and header. */
  csrfToken: string;
  ttlSeconds: number;
}

/**
 * Session lifecycle (CBT-04 section 3.6): server-side rows, a random 32-byte
 * token in the cookie with only its SHA-256 stored, and a CSRF token derived from
 * the session id so it can be re-issued on `GET /auth/me`.
 *
 * Lifetimes come from API spec section 20: 12 hours for staff, 30 days and
 * sliding for parents.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly config: ConfigService,
    @Inject(SESSION_REPOSITORY) private readonly repository: SessionRepository,
    private readonly clock: ClockService,
  ) {}

  /** Lifetime for a role, in seconds. Parents slide, staff do not. */
  ttlSecondsFor(role: Role): number {
    return role === 'parent'
      ? this.config.auth.parentSessionTtlSeconds
      : this.config.auth.staffSessionTtlSeconds;
  }

  async create(user: UserRecord, context: RequestContext): Promise<IssuedSession> {
    const now = this.clock.now();
    const token = randomBytes(32).toString('base64url');
    const sliding = user.role === 'parent';
    const ttlSeconds = this.ttlSecondsFor(user.role);

    const session: SessionRecord = {
      id: uuidv7(),
      userId: user.id,
      tokenHash: sha256Hex(token),
      ip: context.ip,
      userAgent: context.userAgent.slice(0, 512),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      sliding,
      revokedAt: null,
    };

    await this.repository.create(session);
    return { session, token, csrfToken: this.csrfTokenFor(session.id), ttlSeconds };
  }

  /** Resolve a raw cookie token to a live session, or `null`. */
  async findByToken(token: string | undefined): Promise<SessionRecord | null> {
    if (!token) return null;
    const session = await this.repository.findByTokenHash(sha256Hex(token));
    if (!session) return null;
    if (session.revokedAt !== null) return null;
    if (session.expiresAt.getTime() <= this.clock.nowMs()) return null;
    return session;
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const session = await this.repository.findById(id);
    if (!session) return null;
    if (session.revokedAt !== null) return null;
    if (session.expiresAt.getTime() <= this.clock.nowMs()) return null;
    return session;
  }

  /** Record activity, extending a sliding (parent) session on each request. */
  async touch(session: SessionRecord): Promise<void> {
    const now = this.clock.now();
    session.lastSeenAt = now;
    if (session.sliding) {
      session.expiresAt = new Date(now.getTime() + this.ttlSecondsFor('parent') * 1000);
    }
    await this.repository.save(session);
  }

  async revoke(session: SessionRecord): Promise<void> {
    if (session.revokedAt) return;
    session.revokedAt = this.clock.now();
    await this.repository.save(session);
  }

  /** Revoke every session for a user, optionally sparing the current one. */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<number> {
    return this.repository.revokeForUser(userId, this.clock.now(), exceptSessionId);
  }

  async listActiveForUser(userId: string): Promise<SessionRecord[]> {
    return this.repository.listActiveForUser(userId, this.clock.now());
  }

  /**
   * Deterministic CSRF token for a session: `HMAC(SESSION_SECRET,
   * "csrf:" + sessionId)`. Deriving it rather than storing it lets `GET /auth/me`
   * re-issue the same token, and the signature binds it to one session.
   */
  csrfTokenFor(sessionId: string): string {
    return createHmac('sha256', this.config.sessionSecret)
      .update(`csrf:${sessionId}`)
      .digest('base64url');
  }

  /** Constant-time check that a submitted token matches a session's token. */
  csrfMatches(sessionId: string, submitted: string | undefined): boolean {
    if (!submitted) return false;
    const expected = Buffer.from(this.csrfTokenFor(sessionId));
    const actual = Buffer.from(submitted);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }
}
