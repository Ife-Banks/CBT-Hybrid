import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Console PIN reset codes (API spec 12.2, CBT-04 section 4.4).
 *
 *   mac  = HMAC-SHA256(device_secret, "pin-reset|" + floor(unix_time / 3600))
 *   code = (first 4 bytes of mac as an unsigned big-endian integer) mod 100,000,000
 *
 * zero-padded to 8 digits. The school server accepts the code for the current
 * hour and the previous hour, verified offline.
 */

export interface PinResetOptions {
  /** Number of digits in the code. Default 8. */
  digits?: number;
}

/** Hour counter used in the PIN reset message. */
export function pinResetCounter(unixSeconds: number): number {
  return Math.floor(unixSeconds / 3600);
}

/** The PIN reset message for a given time. */
export function pinResetMessage(unixSeconds: number): string {
  return `pin-reset|${pinResetCounter(unixSeconds)}`;
}

/** Compute the PIN reset code for a time. */
export function pinResetCode(
  secret: string | Uint8Array,
  unixSeconds: number,
  options: PinResetOptions = {},
): string {
  const { digits = 8 } = options;
  const mac = createHmac('sha256', secret).update(pinResetMessage(unixSeconds)).digest();
  const code = mac.readUInt32BE(0) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

/**
 * Constant-time verification of a PIN reset code. Accepts the code for the
 * current hour and the previous hour.
 */
export function verifyPinResetCode(
  secret: string | Uint8Array,
  unixSeconds: number,
  code: string,
  options: PinResetOptions = {},
): boolean {
  const candidates = [unixSeconds, unixSeconds - 3600];
  return candidates.some((time) => {
    const expected = Buffer.from(pinResetCode(secret, time, options));
    const given = Buffer.from(code);
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}
