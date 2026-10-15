const encoder = new TextEncoder();

/**
 * FNV-1a 32-bit hash over the UTF-8 bytes of `value` (CBT-04 section 4.3).
 * Used to derive a per-question option seed from the session seed.
 */
export function hash32(value: string): number {
  let h = 0x811c9dc5;
  for (const byte of encoder.encode(value)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
