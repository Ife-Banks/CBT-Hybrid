import {
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib';
import { STUDENT_CODE_ALPHABET, sha256Hex } from '@cbt/exam-core';
import { RECOVERY_CODE_COUNT, TOTP_ISSUER } from './auth.constants';
import { UserRecord } from './domain/types';
import { USER_REPOSITORY, UserRepository } from './repositories/user.repository';
import { ClockService } from './clock.service';

/**
 * Time-based one-time passwords and recovery codes (CBT-04 section 3.6: TOTP with
 * `otplib`, 10 recovery codes stored hashed).
 *
 * Setup and enable are separate: `beginSetup` stores an unconfirmed secret, and
 * `enable` only flips `totp_enabled` once the user proves they can generate a
 * code from it. Codes are checked with a one-step (±30s) tolerance for clock
 * skew (API spec error `CLOCK_SKEW` covers the sync case; this is the login case).
 */
@Injectable()
export class TotpService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly clock: ClockService,
  ) {}

  /** Generate and store an unconfirmed secret; return it with an otpauth URI. */
  async beginSetup(user: UserRecord): Promise<{ secret: string; otpauthUri: string }> {
    const secret = generateSecret();
    user.totpSecret = secret;
    user.totpEnabled = false;
    user.updatedAt = this.clock.now();
    await this.users.save(user);

    const label = user.email ?? user.phone ?? user.id;
    const otpauthUri = generateURI({ issuer: TOTP_ISSUER, label, secret });
    return { secret, otpauthUri };
  }

  /** Confirm the pending secret and issue single-use recovery codes. */
  async enable(user: UserRecord, code: string): Promise<string[]> {
    if (!user.totpSecret) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        detail: 'Start two-step verification setup before enabling it',
      });
    }

    if (!(await this.verifyTotp(user.totpSecret, code))) {
      throw new UnauthorizedException({
        code: 'TOTP_INVALID',
        detail: 'Invalid authenticator code',
      });
    }

    const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
    user.totpEnabled = true;
    user.recoveryCodeHashes = recoveryCodes.map((value) => sha256Hex(normaliseRecoveryCode(value)));
    user.updatedAt = this.clock.now();
    await this.users.save(user);
    return recoveryCodes;
  }

  /** Turn two-step verification off and discard the secret and codes. */
  async disable(user: UserRecord): Promise<void> {
    user.totpEnabled = false;
    user.totpSecret = null;
    user.recoveryCodeHashes = [];
    user.updatedAt = this.clock.now();
    await this.users.save(user);
  }

  /**
   * Verify a submitted code: a current TOTP code first, then a recovery code. A
   * used recovery code is consumed.
   */
  async verify(user: UserRecord, code: string): Promise<boolean> {
    if (user.totpSecret && (await this.verifyTotp(user.totpSecret, code))) {
      return true;
    }
    return this.consumeRecoveryCode(user, code);
  }

  private async verifyTotp(secret: string, code: string): Promise<boolean> {
    try {
      const result = await verifyOtp({ secret, token: code, epochTolerance: 30 });
      return result.valid;
    } catch {
      return false;
    }
  }

  private async consumeRecoveryCode(user: UserRecord, code: string): Promise<boolean> {
    const wanted = Buffer.from(sha256Hex(normaliseRecoveryCode(code)));
    let matchedIndex = -1;
    for (let i = 0; i < user.recoveryCodeHashes.length; i += 1) {
      const stored = Buffer.from(user.recoveryCodeHashes[i] as string);
      if (stored.length === wanted.length && timingSafeEqual(stored, wanted)) {
        matchedIndex = i;
        break;
      }
    }
    if (matchedIndex < 0) return false;

    user.recoveryCodeHashes.splice(matchedIndex, 1);
    user.updatedAt = this.clock.now();
    await this.users.save(user);
    return true;
  }
}

/** Strip separators and upper-case so `abcde-fghjk` matches `ABCDEFGHJK`. */
export function normaliseRecoveryCode(code: string): string {
  return code.replace(/[^0-9a-z]/gi, '').toUpperCase();
}

/** Random recovery codes in `XXXXX-XXXXX` form, using the unambiguous alphabet. */
export function generateRecoveryCodes(count: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let group = '';
    for (let j = 0; j < 10; j += 1) {
      group += STUDENT_CODE_ALPHABET[randomInt(STUDENT_CODE_ALPHABET.length)];
    }
    codes.push(`${group.slice(0, 5)}-${group.slice(5)}`);
  }
  return codes;
}
