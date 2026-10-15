import { Injectable } from '@nestjs/common';
import type { OtpChallengeRecord } from '../domain/types';

/** Injection token for {@link OtpChallengeRepository}. */
export const OTP_CHALLENGE_REPOSITORY = Symbol('OTP_CHALLENGE_REPOSITORY');

/** Persistence port for one-time-code challenges (password reset). */
export interface OtpChallengeRepository {
  create(challenge: OtpChallengeRecord): Promise<void>;
  findById(id: string): Promise<OtpChallengeRecord | null>;
  /** Most recent unconsumed challenge for a purpose, for resend throttling. */
  findLatest(
    userId: string,
    purpose: OtpChallengeRecord['purpose'],
  ): Promise<OtpChallengeRecord | null>;
  save(challenge: OtpChallengeRecord): Promise<void>;
  /** Number of challenges created for a user within an inclusive time window. */
  countSince(userId: string, purpose: OtpChallengeRecord['purpose'], since: Date): Promise<number>;
}

@Injectable()
export class InMemoryOtpChallengeRepository implements OtpChallengeRepository {
  private readonly challenges = new Map<string, OtpChallengeRecord>();

  async create(challenge: OtpChallengeRecord): Promise<void> {
    this.challenges.set(challenge.id, cloneChallenge(challenge));
  }

  async findById(id: string): Promise<OtpChallengeRecord | null> {
    const found = this.challenges.get(id);
    return found ? cloneChallenge(found) : null;
  }

  async findLatest(
    userId: string,
    purpose: OtpChallengeRecord['purpose'],
  ): Promise<OtpChallengeRecord | null> {
    let latest: OtpChallengeRecord | null = null;
    for (const challenge of this.challenges.values()) {
      if (challenge.userId !== userId || challenge.purpose !== purpose) continue;
      if (challenge.consumedAt) continue;
      if (!latest || challenge.createdAt.getTime() > latest.createdAt.getTime()) {
        latest = challenge;
      }
    }
    return latest ? cloneChallenge(latest) : null;
  }

  async save(challenge: OtpChallengeRecord): Promise<void> {
    this.challenges.set(challenge.id, cloneChallenge(challenge));
  }

  async countSince(
    userId: string,
    purpose: OtpChallengeRecord['purpose'],
    since: Date,
  ): Promise<number> {
    let count = 0;
    for (const challenge of this.challenges.values()) {
      if (challenge.userId !== userId || challenge.purpose !== purpose) continue;
      if (challenge.createdAt.getTime() >= since.getTime()) count += 1;
    }
    return count;
  }

  /** Drop every challenge. Test and local-development helper. */
  clear(): void {
    this.challenges.clear();
  }
}

function cloneChallenge(challenge: OtpChallengeRecord): OtpChallengeRecord {
  return {
    ...challenge,
    createdAt: new Date(challenge.createdAt),
    expiresAt: new Date(challenge.expiresAt),
    consumedAt: challenge.consumedAt ? new Date(challenge.consumedAt) : null,
  };
}
