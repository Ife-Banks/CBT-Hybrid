import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { InMemoryOtpChallengeRepository } from '../auth/repositories/otp.repository';
import { InMemoryParentAccountRepository } from './parent-account.repository';
import { ParentAccountService } from './parent-account.service';
import type { GuardianEmailMessage, GuardianNotifier } from './guardian-notifier';

const SCHOOL = 'school-1';
const PARENT_USER = 'user-parent-1';

describe('ParentAccountService', () => {
  let repository: InMemoryParentAccountRepository;
  let challenges: InMemoryOtpChallengeRepository;
  let sent: GuardianEmailMessage[];
  let service: ParentAccountService;

  beforeEach(() => {
    repository = new InMemoryParentAccountRepository();
    repository.seed({
      id: 'guardian-1',
      schoolId: SCHOOL,
      userId: PARENT_USER,
      fullName: 'Mrs Bello',
      email: 'old@example.com',
      phoneE164: null,
      notificationPrefs: {},
    });
    challenges = new InMemoryOtpChallengeRepository();
    sent = [];
    const notifier: GuardianNotifier = {
      sendEmailVerification: async (message) => {
        sent.push(message);
      },
    };
    service = new ParentAccountService(repository, challenges, notifier);
  });

  it('returns the caller own profile', async () => {
    const profile = await service.getMe(SCHOOL, PARENT_USER);
    expect(profile).toMatchObject({ guardianId: 'guardian-1', fullName: 'Mrs Bello' });
  });

  it('updates notification preferences', async () => {
    const profile = await service.updateMe(SCHOOL, PARENT_USER, {
      notificationPrefs: { email: true, whatsapp: true },
    });
    expect(profile.notificationPrefs).toEqual({ email: true, whatsapp: true });
    expect((await service.getMe(SCHOOL, PARENT_USER)).notificationPrefs).toEqual({
      email: true,
      whatsapp: true,
    });
  });

  it('rejects a non-boolean preference', async () => {
    await expect(
      service.updateMe(SCHOOL, PARENT_USER, { notificationPrefs: { sms: 'yes' as never } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('adds and verifies a new email', async () => {
    const challenge = await service.requestEmailOtp(SCHOOL, PARENT_USER, { email: 'New@Example.com' });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('new@example.com');

    const verified = await service.verifyEmailOtp(SCHOOL, PARENT_USER, {
      challengeId: challenge.challengeId,
      code: sent[0]!.code,
      email: 'new@example.com',
    });
    expect(verified.email).toBe('new@example.com');
    expect((await service.getMe(SCHOOL, PARENT_USER)).email).toBe('new@example.com');
  });

  it('rejects a wrong verification code', async () => {
    const challenge = await service.requestEmailOtp(SCHOOL, PARENT_USER, { email: 'new@example.com' });
    await expect(
      service.verifyEmailOtp(SCHOOL, PARENT_USER, {
        challengeId: challenge.challengeId,
        code: '000000',
        email: 'new@example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throttles a second code within a minute', async () => {
    await service.requestEmailOtp(SCHOOL, PARENT_USER, { email: 'new@example.com' });
    await expect(
      service.requestEmailOtp(SCHOOL, PARENT_USER, { email: 'other@example.com' }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('never exposes another guardian', async () => {
    await expect(service.getMe(SCHOOL, 'someone-else')).rejects.toBeInstanceOf(NotFoundException);
  });
});
