import { Injectable } from '@nestjs/common';
import { eq, and, gt, ne, isNull } from 'drizzle-orm';
import { DrizzleService } from '../../../shared/database/drizzle.service';
import { sessions } from '@cbt/shared-types';
import type { SessionRecord } from '../domain/types';
import { toSessionRecord } from '../domain/mappers';
import { SESSION_REPOSITORY, SessionRepository } from './session.repository';

/**
 * Drizzle-backed implementation of SessionRepository.
 * Replaces InMemorySessionRepository when database is configured.
 */
@Injectable()
export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(session: SessionRecord): Promise<void> {
    const db = this.drizzle.getDb();
    await db.insert(sessions).values({
      id: session.id,
      userId: session.userId,
      tokenHash: session.tokenHash,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
      ipAddress: session.ip,
      userAgent: session.userAgent,
      deviceName: session.deviceName,
      revokedAt: session.revokedAt,
      sliding: session.sliding,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const db = this.drizzle.getDb();
    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
      .limit(1);
    const row = rows[0];
    return row ? toSessionRecord(row) : null;
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const db = this.drizzle.getDb();
    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)))
      .limit(1);
    const row = rows[0];
    return row ? toSessionRecord(row) : null;
  }

  async save(session: SessionRecord): Promise<void> {
    const db = this.drizzle.getDb();
    await db
      .update(sessions)
      .set({
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
      })
      .where(eq(sessions.id, session.id));
  }

  async revokeForUser(userId: string, now: Date, exceptSessionId?: string): Promise<number> {
    const db = this.drizzle.getDb();
    const condition = exceptSessionId
      ? and(eq(sessions.userId, userId), isNull(sessions.revokedAt), ne(sessions.id, exceptSessionId))
      : and(eq(sessions.userId, userId), isNull(sessions.revokedAt));

    const result = await db
      .update(sessions)
      .set({ revokedAt: now })
      .where(condition);

    const rows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(condition);

    return rows.length;
  }

  async listActiveForUser(userId: string, now: Date): Promise<SessionRecord[]> {
    const db = this.drizzle.getDb();
    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)));
    return rows.map(toSessionRecord);
  }
}
