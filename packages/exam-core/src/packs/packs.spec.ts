import { describe, expect, it } from 'vitest';
import { ExamCrypto } from '../crypto/exam-crypto';
import { canonicalJson } from './canonical-json';
import { buildPack } from './pack-builder';
import { verifyPack } from './pack-validator';
import type { BuildPackInput } from './types';
import { crc32, readZip, writeZip } from './zip';

const crypto = new ExamCrypto();
const { publicKeyPem, privateKeyPem } = crypto.generateSigningKeyPair();
const PACK_KEY = new Uint8Array(32).fill(7);
const BUILT_AT = '2026-10-18T14:02:11.000Z';

function baseInput(overrides: Partial<BuildPackInput> = {}): BuildPackInput {
  return {
    packId: 'pack-1',
    schoolId: 'school-1',
    examId: 'exam-1',
    version: 2,
    keyVersion: 1,
    builtAt: BUILT_AT,
    packKey: PACK_KEY,
    signingPrivateKeyPem: privateKeyPem,
    signingKeyId: 'ps-2026-1',
    exam: {
      title: 'JSS 2 Mathematics',
      subject: { id: 'sub-1', name: 'Mathematics' },
      section: 'secondary',
      durationMin: 60,
      instructionsHtml: '<p>Answer all questions.</p>',
      shuffleQuestions: true,
      shuffleOptions: true,
      showScoreToStudent: false,
    },
    questions: [
      {
        questionId: 'q-1',
        position: 1,
        type: 'single_choice',
        stem: '<p>What is 2^3?</p>',
        marks: 1,
        options: [
          { id: 'opt-a', label: 'A', body: '6', sortOrder: 1 },
          { id: 'opt-b', label: 'B', body: '8', sortOrder: 2 },
        ],
        correctOptionIds: ['opt-b'],
        assetIds: [],
      },
      {
        questionId: 'q-2',
        position: 2,
        type: 'fill_blank',
        stem: '<p>The capital of Nigeria is ____.</p>',
        marks: 2,
        fillAnswers: { answers: ['Abuja', 'abuja-city'] },
      },
    ],
    assets: [],
    ...overrides,
  };
}

describe('canonicalJson', () => {
  it('sorts object keys and omits whitespace', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });

  it('is stable regardless of key insertion order', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });
});

describe('zip', () => {
  it('round-trips stored entries', () => {
    const entries = [
      { path: 'b.txt', data: new TextEncoder().encode('second') },
      { path: 'a.txt', data: new TextEncoder().encode('first') },
    ];
    const zip = writeZip(entries);
    const read = readZip(zip);
    expect(read.map((entry) => entry.path)).toEqual(['a.txt', 'b.txt']);
    expect(new TextDecoder().decode(read[0]!.data)).toBe('first');
  });

  it('computes the standard CRC-32 vector', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('is byte-for-byte deterministic', () => {
    const entries = [{ path: 'a.txt', data: new TextEncoder().encode('first') }];
    expect(Buffer.from(writeZip(entries)).equals(Buffer.from(writeZip(entries)))).toBe(true);
  });
});

describe('buildPack', () => {
  it('produces identical bytes for identical inputs', () => {
    const first = buildPack(baseInput());
    const second = buildPack(baseInput());
    expect(first.sha256).toBe(second.sha256);
    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(true);
  });

  it('changes bytes when the build timestamp changes', () => {
    const first = buildPack(baseInput());
    const second = buildPack(baseInput({ builtAt: '2026-10-18T15:00:00.000Z' }));
    expect(first.sha256).not.toBe(second.sha256);
  });

  it('lists every payload file with a hash and keeps answer keys out of the clear', () => {
    const pack = buildPack(baseInput());
    const paths = pack.manifest.files.map((file) => file.path).sort();
    expect(paths).toEqual(['keys.enc', 'questions.json']);

    const entries = readZip(pack.bytes);
    const questions = entries.find((entry) => entry.path === 'questions.json')!;
    const text = new TextDecoder().decode(questions.data);
    expect(text).toContain('What is 2^3?');
    expect(text).not.toContain('is_correct');
    expect(text).not.toContain('"answers"');
    expect(text.toLowerCase()).not.toContain('abuja');
  });

  it('rejects questions without answer keys', () => {
    expect(() =>
      buildPack(
        baseInput({
          questions: [
            {
              questionId: 'q-1',
              position: 1,
              type: 'single_choice',
              stem: 'x',
              marks: 1,
              options: [{ id: 'a', label: 'A', body: 'a' }],
              correctOptionIds: [],
            },
          ],
        }),
      ),
    ).toThrow();
  });
});

describe('verifyPack', () => {
  it('accepts a pack built by the same key pair', () => {
    const pack = buildPack(baseInput());
    const result = verifyPack(pack.bytes, {
      publicKeyPem,
      expectedSchoolId: 'school-1',
      packKey: PACK_KEY,
    });
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects a flipped byte with a hash failure', () => {
    const pack = buildPack(baseInput());
    const tampered = pack.bytes.slice();
    const questionsIndex = indexOfBytes(tampered, new TextEncoder().encode('What is 2^3?'));
    expect(questionsIndex).toBeGreaterThan(0);
    tampered[questionsIndex] = 0x62; // 'W' -> 'b'
    const result = verifyPack(tampered, { publicKeyPem, packKey: PACK_KEY });
    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain('FILE_HASH_MISMATCH');
  });

  it('rejects a pack for a different school', () => {
    const pack = buildPack(baseInput());
    const result = verifyPack(pack.bytes, { publicKeyPem, expectedSchoolId: 'other-school' });
    expect(result.failures.map((failure) => failure.code)).toContain('SCHOOL_MISMATCH');
  });

  it('rejects a signature made by another key', () => {
    const pack = buildPack(baseInput());
    const other = new ExamCrypto().generateSigningKeyPair();
    const result = verifyPack(pack.bytes, { publicKeyPem: other.publicKeyPem });
    expect(result.failures.map((failure) => failure.code)).toContain('SIGNATURE_INVALID');
  });

  it('reports KEYS_DECRYPT_FAILED for the wrong pack key', () => {
    const pack = buildPack(baseInput());
    const result = verifyPack(pack.bytes, {
      publicKeyPem,
      packKey: new Uint8Array(32).fill(9),
    });
    expect(result.failures.map((failure) => failure.code)).toContain('KEYS_DECRYPT_FAILED');
  });

  it('rejects something that is not a ZIP archive', () => {
    const result = verifyPack(new TextEncoder().encode('not a zip'), { publicKeyPem });
    expect(result.failures[0]!.code).toBe('PACK_NOT_ZIP');
  });
});

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
