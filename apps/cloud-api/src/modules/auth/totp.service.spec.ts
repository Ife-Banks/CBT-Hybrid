import { beforeEach, describe, expect, it } from 'vitest';
import { generate } from 'otplib';
import { UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { sha256Hex } from '@cbt/exam-core';
import { TotpService, normaliseRecoveryCode } from './totp.service';
import { InMemoryUserRepository } from './repositories/user.repository';
import { PasswordService } from './password.service';
import { FakeClock, seedUser } from './testing/auth.fixture';
import type { UserRecord } from './domain/types';

describe('TotpService', () => {
  let users: InMemoryUserRepository;
  let totp: TotpService;
  let user: UserRecord;

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    totp = new TotpService(users, new FakeClock());
    user = await seedUser(users, new PasswordService(), {
      role: 'school_admin',
      passwordHash: 'unused-for-2fa-tests',
    });
  });

  it('creates an unconfirmed secret and an otpauth URI', async () => {
    const setup = await totp.beginSetup(user);
    expect(setup.secret.length).toBeGreaterThan(0);
    expect(setup.otpauthUri).toContain('otpauth://totp/');
    expect(setup.otpauthUri).toContain('CBT%20School');
    expect(user.totpEnabled).toBe(false);
    expect((await users.findById(user.id))?.totpSecret).toBe(setup.secret);
  });

  it('rejects enabling with a wrong code', async () => {
    await totp.beginSetup(user);
    await expect(totp.enable(user, '000000')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(user.totpEnabled).toBe(false);
  });

  it('refuses to enable before setup', async () => {
    await expect(totp.enable(user, '123456')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('enables with a valid code and issues ten hashed recovery codes', async () => {
    const setup = await totp.beginSetup(user);
    const code = await generate({ secret: setup.secret });
    const recoveryCodes = await totp.enable(user, code);

    expect(recoveryCodes).toHaveLength(10);
    expect(recoveryCodes.every((value) => /^[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(value))).toBe(true);
    expect(user.totpEnabled).toBe(true);
    // Stored hashed, never in the clear.
    expect(user.recoveryCodeHashes).toHaveLength(10);
    expect(user.recoveryCodeHashes).not.toContain(recoveryCodes[0]);
    expect(user.recoveryCodeHashes).toContain(sha256Hex(normaliseRecoveryCode(recoveryCodes[0]!)));
  });

  it('verifies a current authenticator code', async () => {
    const setup = await totp.beginSetup(user);
    await totp.enable(user, await generate({ secret: setup.secret }));
    expect(await totp.verify(user, await generate({ secret: setup.secret }))).toBe(true);
    expect(await totp.verify(user, '111111')).toBe(false);
  });

  it('consumes a recovery code exactly once', async () => {
    const setup = await totp.beginSetup(user);
    const recoveryCodes = await totp.enable(user, await generate({ secret: setup.secret }));

    expect(await totp.verify(user, recoveryCodes[0]!)).toBe(true);
    expect(await totp.verify(user, recoveryCodes[0]!)).toBe(false);
    expect(user.recoveryCodeHashes).toHaveLength(9);
  });

  it('disables two-step verification and clears secrets', async () => {
    const setup = await totp.beginSetup(user);
    await totp.enable(user, await generate({ secret: setup.secret }));
    await totp.disable(user);
    expect(user.totpEnabled).toBe(false);
    expect(user.totpSecret).toBeNull();
    expect(user.recoveryCodeHashes).toEqual([]);
  });

  it('normalises recovery codes for comparison', () => {
    expect(normaliseRecoveryCode('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(normaliseRecoveryCode(' ABCDE FGHJK ')).toBe('ABCDEFGHJK');
  });
});
