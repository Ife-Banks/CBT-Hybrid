import { createHmac, timingSafeEqual } from 'node:crypto';
import { sha256Hex } from './sha256';

/**
 * Sync request signing (CBT-04 section 4.4).
 *
 * `string_to_sign` is six lines joined with `\n`:
 *   1. protocol version (`v1`)
 *   2. HTTP method (upper case)
 *   3. path and query string
 *   4. Unix timestamp (seconds)
 *   5. nonce
 *   6. `sha256_hex(body)`
 *
 * The signature is `HMAC-SHA256(secret, string_to_sign)` in hex.
 */

export const SYNC_PROTOCOL_VERSION = 'v1';

export function buildStringToSign(
  method: string,
  pathWithQuery: string,
  timestamp: number | string,
  nonce: string,
  body: string | Uint8Array = '',
): string {
  return [
    SYNC_PROTOCOL_VERSION,
    method.toUpperCase(),
    pathWithQuery,
    String(timestamp),
    nonce,
    sha256Hex(body),
  ].join('\n');
}

/** Compute the request signature. */
export function signRequest(
  secret: string | Uint8Array,
  method: string,
  pathWithQuery: string,
  timestamp: number | string,
  nonce: string,
  body: string | Uint8Array = '',
): string {
  const stringToSign = buildStringToSign(method, pathWithQuery, timestamp, nonce, body);
  return createHmac('sha256', secret).update(stringToSign).digest('hex');
}

/** Constant-time verification of a request signature. */
export function verifySignature(
  secret: string | Uint8Array,
  method: string,
  pathWithQuery: string,
  timestamp: number | string,
  nonce: string,
  body: string | Uint8Array,
  signature: string,
): boolean {
  const expected = signRequest(secret, method, pathWithQuery, timestamp, nonce, body);
  const expectedBuf = Buffer.from(expected, 'hex');
  const givenBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== givenBuf.length || expectedBuf.length === 0) return false;
  return timingSafeEqual(expectedBuf, givenBuf);
}
