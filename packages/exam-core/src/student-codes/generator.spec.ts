import { describe, expect, it } from 'vitest';
import { STUDENT_CODE_ALPHABET, STUDENT_CODE_ALPHABET_SIZE } from '../alphabet';
import {
  BODY_LENGTH,
  StudentCodeGenerator,
  StudentCodeValidator,
  computeCheck,
  isValidCodeBody,
  normalise,
} from './generator';

// Test vectors from CBT-04-Build-Specification.md section 4.1.
const VECTORS: ReadonlyArray<readonly [string, string]> = [
  ['7K2M9QXD', 'G'],
  ['K7M2P9QX', 'W'],
  ['22222222', '2'],
  ['ZZZZZZZZ', '6'],
  ['M4R8T2VX', 'Y'],
];

const generator = new StudentCodeGenerator();
const validator = new StudentCodeValidator();

describe('alphabet', () => {
  it('is 31 characters and excludes 0 1 I L O', () => {
    expect(STUDENT_CODE_ALPHABET_SIZE).toBe(31);
    expect(STUDENT_CODE_ALPHABET).toBe('23456789ABCDEFGHJKMNPQRSTUVWXYZ');
    for (const forbidden of ['0', '1', 'I', 'L', 'O']) {
      expect(STUDENT_CODE_ALPHABET).not.toContain(forbidden);
    }
  });
});

describe('computeCheck (section 4.1 vectors)', () => {
  it.each(VECTORS)('body %s -> check %s', (body, check) => {
    expect(computeCheck(body)).toBe(check);
  });

  it('rejects bodies of the wrong length or with invalid characters', () => {
    expect(() => computeCheck('ABC')).toThrow();
    expect(() => computeCheck('7K2M9QX0')).toThrow();
  });
});

describe('isValidCodeBody', () => {
  it.each(VECTORS)('%s%s is valid', (body, check) => {
    expect(isValidCodeBody(body + check)).toBe(true);
  });

  it('rejects a wrong check character', () => {
    expect(isValidCodeBody('7K2M9QXDH')).toBe(false);
  });

  it('rejects two swapped neighbouring characters', () => {
    expect(isValidCodeBody('7K2M9QDXG')).toBe(false);
  });

  it('rejects strings with 0, 1, I, L, O or lowercase', () => {
    for (const bad of ['7K2M9QXD0', '7K2M9QXD1', '7K2M9QXDI', '7K2M9QXDL', '7K2M9QXDO']) {
      expect(isValidCodeBody(bad)).toBe(false);
    }
    expect(isValidCodeBody('7k2m9qxdg')).toBe(false);
  });
});

describe('normalise', () => {
  it('uppercases and strips spaces and hyphens', () => {
    expect(normalise(' gra- 7k2m9qxdg ')).toBe('GRA7K2M9QXDG');
  });
});

describe('formatCode / validateCode', () => {
  it('formats a full code', () => {
    expect(generator.formatCode('GRA', '7K2M9QXD')).toBe('GRA-7K2M9QXDG');
  });

  it('validates a full code', () => {
    expect(validator.validateCode('GRA-7K2M9QXDG')).toBe(true);
  });

  it('rejects wrong check, swap, invalid char and wrong school format', () => {
    expect(validator.validateCode('GRA-7K2M9QXDH')).toBe(false);
    expect(validator.validateCode('GRA-7K2M9QDXG')).toBe(false);
    expect(validator.validateCode('GRA-7K2M9QXD0')).toBe(false);
    expect(validator.validateCode('GR-7K2M9QXDG')).toBe(false);
  });
});

describe('properties', () => {
  it('generates bodies whose computed check validates', () => {
    for (let i = 0; i < 10_000; i += 1) {
      const body = generator.generateBody();
      expect(body).toHaveLength(BODY_LENGTH);
      expect(isValidCodeBody(body + computeCheck(body))).toBe(true);
    }
  });

  it('rejects every single-character substitution', () => {
    const body = '7K2M9QXD';
    const check = computeCheck(body);
    for (let i = 0; i < body.length; i += 1) {
      for (const char of STUDENT_CODE_ALPHABET) {
        if (char === body[i]) continue;
        const mutated = body.slice(0, i) + char + body.slice(i + 1);
        expect(isValidCodeBody(mutated + check)).toBe(false);
      }
    }
  });

  it('rejects every swap of two neighbouring characters', () => {
    const body = '7K2M9QXD';
    const check = computeCheck(body);
    for (let i = 0; i < body.length - 1; i += 1) {
      const chars = [...body];
      [chars[i], chars[i + 1]] = [chars[i + 1] as string, chars[i] as string];
      expect(isValidCodeBody(chars.join('') + check)).toBe(false);
    }
  });
});
