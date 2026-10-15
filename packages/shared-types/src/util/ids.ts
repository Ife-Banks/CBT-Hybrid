/**
 * UUIDv7 generation (time-ordered, RFC 9562). Isomorphic: uses
 * `globalThis.crypto.getRandomValues`, which exists in Node 18+ and in browsers.
 *
 * Used for request correlation ids now, and for database primary keys later
 * (API spec 3.1). UUIDv7 is preferred over v4 because it sorts by creation time.
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);

  const ts = Date.now();
  bytes[0] = Math.floor(ts / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ts / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ts / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ts / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;

  // Version 7 in the top nibble of byte 6.
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70;
  // RFC 4122 variant in the top two bits of byte 8.
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** True when `value` is a syntactically valid UUID (any version). */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
