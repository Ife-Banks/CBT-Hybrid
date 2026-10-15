import { hkdfSync } from 'node:crypto';

/**
 * HKDF-SHA256 key derivation (extract-then-expand). Returns `length` bytes.
 * Used for pack key wrapping: `HKDF(ikm = secret, salt, info, length = 32)`.
 */
export function hkdfSha256(
  ikm: string | Uint8Array,
  salt: string | Uint8Array,
  info: string | Uint8Array,
  length = 32,
): Buffer {
  return Buffer.from(hkdfSync('sha256', ikm, salt, info, length));
}

/** Hex form of {@link hkdfSha256}. */
export function hkdfSha256Hex(
  ikm: string | Uint8Array,
  salt: string | Uint8Array,
  info: string | Uint8Array,
  length = 32,
): string {
  return hkdfSha256(ikm, salt, info, length).toString('hex');
}
