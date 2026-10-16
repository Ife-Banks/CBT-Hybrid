/**
 * Minimal, deterministic ZIP archive writer and reader.
 *
 * The pack format (API spec 14.1) is a ZIP archive. We only need the `store`
 * (uncompressed) method: it is deterministic, dependency-free and fast enough
 * for the pack sizes involved. Entries are always emitted sorted by path and
 * with a fixed timestamp so identical inputs produce identical bytes.
 */

const LOCAL_HEADER_SIG = 0x04034b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

export interface ZipWriteOptions {
  /** Modification time recorded for every entry. Defaults to 1980-01-01. */
  modifiedAt?: Date;
}

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

/** CRC-32 (IEEE 802.3) of a byte buffer. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    const byte = data[i] ?? 0;
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date | undefined): { time: number; date: number } {
  const d = date ?? new Date(Date.UTC(1980, 0, 1));
  const time = ((d.getUTCHours() & 0x1f) << 11) | ((d.getUTCMinutes() & 0x3f) << 5) | ((d.getUTCSeconds() >> 1) & 0x1f);
  const day = ((d.getUTCFullYear() - 1980) & 0x7f) << 9;
  const month = ((d.getUTCMonth() + 1) & 0x0f) << 5;
  return { time, date: day | month | (d.getUTCDate() & 0x1f) };
}

/** Write a ZIP archive from the given entries. */
export function writeZip(entries: readonly ZipEntry[], options: ZipWriteOptions = {}): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(options.modifiedAt);
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of sorted) {
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL_HEADER_SIG, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, UTF8_FLAG, true);
    lv.setUint16(8, STORE_METHOD, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const centralHeader = new Uint8Array(46 + name.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, CENTRAL_HEADER_SIG, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, UTF8_FLAG, true);
    cv.setUint16(10, STORE_METHOD, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(name, 46);

    chunks.push(local, entry.data);
    central.push(centralHeader);
    offset += local.length + size;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const header of central) {
    centralSize += header.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, EOCD_SIG, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, sorted.length, true);
  ev.setUint16(10, sorted.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  ev.setUint16(20, 0, true);

  return concat([...chunks, ...central, eocd]);
}

/** Read every entry from a ZIP archive produced by {@link writeZip} (or any stored ZIP). */
export function readZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const eocd = findEocd(view);
  if (eocd < 0) {
    throw new Error('Not a ZIP archive: end-of-central-directory record not found');
  }
  const total = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < total; i += 1) {
    if (view.getUint32(pos, true) !== CENTRAL_HEADER_SIG) {
      throw new Error('Corrupt ZIP archive: bad central directory header');
    }
    const method = view.getUint16(pos + 10, true);
    const compSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const path = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));

    if (view.getUint32(localOffset, true) !== LOCAL_HEADER_SIG) {
      throw new Error(`Corrupt ZIP archive: bad local header for ${path}`);
    }
    if (method !== STORE_METHOD) {
      throw new Error(`Unsupported ZIP compression method ${method} for ${path}`);
    }
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    entries.push({ path, data: bytes.slice(dataStart, dataStart + compSize) });

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

function findEocd(view: DataView): number {
  const max = Math.min(view.byteLength, 22 + 0xffff);
  for (let i = view.byteLength - 22; i >= view.byteLength - max; i -= 1) {
    if (i < 0) break;
    if (view.getUint32(i, true) === EOCD_SIG) {
      return i;
    }
  }
  return -1;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) {
    total += part.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
