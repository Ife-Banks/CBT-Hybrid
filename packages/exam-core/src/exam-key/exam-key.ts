import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Exam keys are six digits (000000-999999, leading zeros allowed), generated
 * from a cryptographically secure RNG (CBT-04 section 4.2).
 */
export function generateExamKey(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Hash an exam key for storage: `SHA-256(sitting_id + ":" + key)` hex. Only the
 * hash is stored; the plain key stays in memory while the sitting is open.
 */
export function hashExamKey(sittingId: string, key: string): string {
  return createHash('sha256').update(`${sittingId}:${key}`).digest('hex');
}

/** Constant-time comparison of a candidate key against a stored hash. */
export function verifyExamKey(sittingId: string, key: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashExamKey(sittingId, key), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length || actual.length === 0) return false;
  return timingSafeEqual(actual, expected);
}
