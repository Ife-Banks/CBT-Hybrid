import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OTP_CHALLENGE_REPOSITORY, type OtpChallengeRepository } from '../auth/repositories/otp.repository';
import type { NotificationPreferences } from '../results/domain/types';
import {
  codesMatch,
  generateGuardianCode,
  hashGuardianCode,
  GUARDIAN_OTP_MAX_ATTEMPTS,
  GUARDIAN_OTP_RESEND_MS,
  GUARDIAN_OTP_TTL_MS,
} from './guardian-otp';
import { GUARDIAN_NOTIFIER, type GuardianNotifier } from './guardian-notifier';
import {
  PARENT_ACCOUNT_REPOSITORY,
  type GuardianProfile,
  type ParentAccountRepository,
} from './parent-account.repository';

export interface ParentProfile {
  guardianId: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  notificationPrefs: NotificationPreferences;
}

export interface EmailOtpChallenge {
  challengeId: string;
  email: string;
  expiresAt: string;
}

export interface EmailVerified {
  email: string;
}

/**
 * The parent's own account (API spec section 10): notification preferences and
 * the email-add/change flow. Every route resolves the guardian from the signed-in
 * user, so a parent can only ever read or change their own record.
 */
@Injectable()
export class ParentAccountService {
  constructor(
    @Inject(PARENT_ACCOUNT_REPOSITORY) private readonly repository: ParentAccountRepository,
    @Inject(OTP_CHALLENGE_REPOSITORY) private readonly challenges: OtpChallengeRepository,
    @Inject(GUARDIAN_NOTIFIER) private readonly notifier: GuardianNotifier,
  ) {}

  async getMe(schoolId: string, userId: string): Promise<ParentProfile> {
    return toProfile(await this.requireGuardian(schoolId, userId));
  }

  async updateMe(
    schoolId: string,
    userId: string,
    input: { notificationPrefs?: NotificationPreferences },
  ): Promise<ParentProfile> {
    const guardian = await this.requireGuardian(schoolId, userId);
    if (input.notificationPrefs) {
      const prefs = validatePrefs(input.notificationPrefs);
      await this.repository.updateNotificationPrefs(guardian.id, prefs);
    }
    return this.getMe(schoolId, userId);
  }

  /** Start an email add/change: send a code to the new address. */
  async requestEmailOtp(
    schoolId: string,
    userId: string,
    input: { email: string },
  ): Promise<EmailOtpChallenge> {
    const guardian = await this.requireGuardian(schoolId, userId);
    if (!guardian.userId) {
      throw new NotFoundException({ code: 'GUARDIAN_NOT_FOUND', message: 'Guardian not found' });
    }

    const email = input.email.trim().toLowerCase();
    const now = new Date();
    const recent = await this.challenges.countSince(
      guardian.userId,
      'guardian_email',
      new Date(now.getTime() - GUARDIAN_OTP_RESEND_MS),
    );
    if (recent > 0) {
      throw new HttpException(
        {
          code: 'EMAIL_OTP_THROTTLED',
          message: 'A verification code was just sent; try again shortly',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = generateGuardianCode();
    const expiresAt = new Date(now.getTime() + GUARDIAN_OTP_TTL_MS);
    const challengeId = randomUUID();
    await this.challenges.create({
      id: challengeId,
      userId: guardian.userId,
      purpose: 'guardian_email',
      sentTo: email,
      codeHash: hashGuardianCode(code),
      attempts: 0,
      maxAttempts: GUARDIAN_OTP_MAX_ATTEMPTS,
      createdAt: now,
      expiresAt,
      consumedAt: null,
    });
    await this.notifier.sendEmailVerification({ to: email, fullName: guardian.fullName, code });

    return { challengeId, email, expiresAt: expiresAt.toISOString() };
  }

  /** Verify the code and attach the verified email to the guardian. */
  async verifyEmailOtp(
    schoolId: string,
    userId: string,
    input: { challengeId: string; code: string; email: string },
  ): Promise<EmailVerified> {
    const guardian = await this.requireGuardian(schoolId, userId);
    if (!guardian.userId) {
      throw new NotFoundException({ code: 'GUARDIAN_NOT_FOUND', message: 'Guardian not found' });
    }

    const email = input.email.trim().toLowerCase();
    const challenge = await this.challenges.findById(input.challengeId);
    if (
      !challenge ||
      challenge.purpose !== 'guardian_email' ||
      challenge.userId !== guardian.userId ||
      challenge.sentTo !== email
    ) {
      throw new BadRequestException({ code: 'OTP_INVALID', message: 'Verification code is not valid' });
    }
    if (challenge.consumedAt) {
      throw new BadRequestException({ code: 'OTP_CONSUMED', message: 'Verification code was already used' });
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({ code: 'OTP_EXPIRED', message: 'Verification code has expired' });
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      throw new BadRequestException({ code: 'OTP_LOCKED', message: 'Too many attempts; request a new code' });
    }

    challenge.attempts += 1;
    if (!codesMatch(challenge.codeHash, input.code)) {
      await this.challenges.save(challenge);
      throw new BadRequestException({ code: 'OTP_INVALID', message: 'Verification code is not valid' });
    }

    challenge.consumedAt = new Date();
    await this.challenges.save(challenge);
    await this.repository.updateEmail(guardian.id, email);
    return { email };
  }

  private async requireGuardian(schoolId: string, userId: string): Promise<GuardianProfile> {
    const guardian = await this.repository.findByUserId(userId);
    if (!guardian || guardian.schoolId !== schoolId) {
      throw new NotFoundException({ code: 'GUARDIAN_NOT_FOUND', message: 'Guardian not found' });
    }
    return guardian;
  }
}

function toProfile(guardian: GuardianProfile): ParentProfile {
  return {
    guardianId: guardian.id,
    fullName: guardian.fullName,
    email: guardian.email,
    phoneE164: guardian.phoneE164,
    notificationPrefs: { ...guardian.notificationPrefs },
  };
}

/** Reject anything other than booleans on the four channel keys. */
function validatePrefs(prefs: NotificationPreferences): NotificationPreferences {
  const allowed: Array<keyof NotificationPreferences> = ['email', 'sms', 'whatsapp', 'inApp'];
  const cleaned: NotificationPreferences = {};
  for (const key of allowed) {
    const value = prefs[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      throw new BadRequestException({
        code: 'INVALID_PREFERENCES',
        message: `notification_prefs.${key} must be a boolean`,
      });
    }
    cleaned[key] = value;
  }
  return cleaned;
}
