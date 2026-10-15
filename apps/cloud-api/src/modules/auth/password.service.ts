import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';
import {
  PASSWORD_MAX_LENGTH,
  type PasswordPolicyContext,
  type PasswordPolicyViolation,
  validatePassword,
} from '@cbt/shared-types';

/**
 * Argon2id hashing and the password policy check (CBT-04 section 3.6, which
 * fixes `m = 19456 KiB, t = 2, p = 1`).
 *
 * The parameters sit just below the Argon2id *version 13* recommendation
 * (19 MiB, 2 iterations) because that is what CBT-04 specifies; they remain well
 * within OWASP's published range for an interactive login.
 */
@Injectable()
export class PasswordService {
  private static readonly OPTIONS = {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  /**
   * Throwaway hash generated once per process. No user's password maps to it; it
   * exists so verifying an unknown account costs exactly as much as verifying a
   * real one.
   */
  private readonly dummyHash: Promise<string>;

  constructor() {
    this.dummyHash = hash(randomBytes(16).toString('hex'), PasswordService.OPTIONS);
  }

  /** Argon2id hash of a password. Always generates a fresh salt. */
  async hash(password: string): Promise<string> {
    return hash(password, PasswordService.OPTIONS);
  }

  /**
   * Verify a password against an encoded hash. Returns `false` for a corrupt or
   * unparseable hash instead of throwing, so a bad row cannot break sign-in.
   */
  async verify(encodedHash: string, password: string): Promise<boolean> {
    if (!encodedHash) return false;
    try {
      return await verify(encodedHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Burn an Argon2id verification against a throwaway hash so an unknown account
   * costs the same as a known one (timing-attack defence for `INVALID_CREDENTIALS`).
   */
  async verifyDummy(password: string): Promise<void> {
    try {
      await verify(await this.dummyHash, password);
    } catch {
      // Never fail the request for this side effect.
    }
  }

  /**
   * Run the password policy. Each violation is a field error suitable for the
   * `errors[]` array of a `422 VALIDATION_FAILED` response.
   */
  validate(
    password: string,
    context: PasswordPolicyContext = {},
    field = 'new_password',
  ): PasswordPolicyViolation[] {
    if (password.length > PASSWORD_MAX_LENGTH) {
      return [
        {
          field,
          code: 'TOO_LONG',
          message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
        },
      ];
    }
    return validatePassword(password, context, field);
  }
}
