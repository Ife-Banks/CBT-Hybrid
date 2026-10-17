import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/** Guardian email verification codes live for 10 minutes. */
export const GUARDIAN_OTP_TTL_MS = 10 * 60 * 1000;
/** Parents get 5 tries per code. */
export const GUARDIAN_OTP_MAX_ATTEMPTS = 5;
/** Throttle resends to one per minute. */
export const GUARDIAN_OTP_RESEND_MS = 60 * 1000;

/** A zero-padded numeric code of the given length. */
export function generateGuardianCode(digits = 6): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, '0');
}

/** SHA-256 hex of a code, matching the auth OTP repository's storage. */
export function hashGuardianCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Constant-time hex comparison. */
export function codesMatch(expectedHash: string, code: string): boolean {
  const actual = Buffer.from(hashGuardianCode(code), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
