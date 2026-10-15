import { Injectable } from '@nestjs/common';
import type { SessionRecord } from '../domain/types';

/** Injection token for {@link SessionRepository}. */
export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

/** Persistence port for sessions (CBT-04 section 3.6: server-side rows). */
export interface SessionRepository {
  create(session: SessionRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  findById(id: string): Promise<SessionRecord | null>;
  /** Non-revoked, non-expired sessions for a user. */
  listActiveForUser(userId: string, now: Date): Promise<SessionRecord[]>;
  save(session: SessionRecord): Promise<void>;
  /** Revoke every active session for a user, optionally sparing one. */
  revokeForUser(userId: string, now: Date, exceptSessionId?: string): Promise<number>;
}

@Injectable()
export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, SessionRecord>();

  async create(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, cloneSession(session));
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    for (const session of this.sessions.values()) {
      if (session.tokenHash === tokenHash) return cloneSession(session);
    }
    return null;
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const found = this.sessions.get(id);
    return found ? cloneSession(found) : null;
  }

  async listActiveForUser(userId: string, now: Date): Promise<SessionRecord[]> {
    return [...this.sessions.values()]
      .filter((session) => isActive(session, now))
      .filter((session) => session.userId === userId)
      .map(cloneSession);
  }

  async save(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, cloneSession(session));
  }

  async revokeForUser(userId: string, now: Date, exceptSessionId?: string): Promise<number> {
    let revoked = 0;
    for (const session of this.sessions.values()) {
      if (session.userId !== userId) continue;
      if (session.revokedAt) continue;
      if (exceptSessionId && session.id === exceptSessionId) continue;
      session.revokedAt = new Date(now.getTime());
      revoked += 1;
    }
    return revoked;
  }

  /** Drop every session. Test and local-development helper. */
  clear(): void {
    this.sessions.clear();
  }
}

/** A session that can still authenticate a request. */
export function isActive(session: SessionRecord, now: Date): boolean {
  return session.revokedAt === null && session.expiresAt.getTime() > now.getTime();
}

function cloneSession(session: SessionRecord): SessionRecord {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    lastSeenAt: new Date(session.lastSeenAt),
    expiresAt: new Date(session.expiresAt),
    revokedAt: session.revokedAt ? new Date(session.revokedAt) : null,
  };
}
