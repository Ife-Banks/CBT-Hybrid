import { Injectable } from '@nestjs/common';
import { eq, and, gt, gte, isNull } from 'drizzle-orm';
import { DrizzleService } from '../../../shared/database/drizzle.service';
import { otpChallenges } from '@cbt/shared-types';
import type { OtpChallengeRecord } from '../domain/types';
import { toOtpChallengeRecord } from '../domain/mappers';
import { OTP_CHALLENGE_REPOSITORY, OtpChallengeRepository } from './otp.repository';

/**
 * Drizzle-backed implementation of OtpChallengeRepository.
 * Replaces InMemoryOtpChallengeRepository when database is configured.
 */
@Injectable()
export class DrizzleOtpChallengeRepository implements OtpChallengeRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(challenge: OtpChallengeRecord): Promise<void> {
    const db = this.drizzle.getDb();
    await db.insert(otpChallenges).values({
      id: challenge.id,
      userId: challenge.userId,
      purpose: challenge.purpose as any,
      sentTo: challenge.sentTo,
      codeHash: challenge.codeHash,
      attempts: challenge.attempts,
      maxAttempts: challenge.maxAttempts,
      expiresAt: challenge.expiresAt,
      consumedAt: challenge.consumedAt,
      createdAt: challenge.createdAt,
    });
  }

  async findById(id: string): Promise<OtpChallengeRecord | null> {
    const db = this.drizzle.getDb();
    const rows = await db
      .select()
      .from(otpChallenges)
      .where(eq(otpChallenges.id, id))
      .limit(1);
    const row = rows[0];
    return row ? toOtpChallengeRecord(row) : null;
  }

  async save(challenge: OtpChallengeRecord): Promise<void> {
    const db = this.drizzle.getDb();
    await db
      .update(otpChallenges)
      .set({
        attempts: challenge.attempts,
        consumedAt: challenge.consumedAt,
      })
      .where(eq(otpChallenges.id, challenge.id));
  }

  async findLatest(userId: string, purpose: string): Promise<OtpChallengeRecord | null> {
    const db = this.drizzle.getDb();
    const rows = await db
      .select()
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.userId, userId),
          eq(otpChallenges.purpose, purpose as any),
          isNull(otpChallenges.consumedAt),
          gt(otpChallenges.expiresAt, new Date()),
        ),
      )
      .orderBy(otpChallenges.createdAt)
      .limit(1);
    const row = rows[0];
    return row ? toOtpChallengeRecord(row) : null;
  }

  async countSince(userId: string, purpose: string, since: Date): Promise<number> {
    const db = this.drizzle.getDb();
    const result = await db
      .select({ count: otpChallenges.id })
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.userId, userId),
          eq(otpChallenges.purpose, purpose as any),
          gte(otpChallenges.createdAt, since),
        ),
      );
    return result.length;
  }
}
