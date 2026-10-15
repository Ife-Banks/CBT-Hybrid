import { describe, expect, it } from 'vitest';
import { normalisePhone, normalisePhoneOrThrow } from './phone';

describe('normalisePhone (section 4.5 vectors)', () => {
  const cases: ReadonlyArray<readonly [string, string | null]> = [
    ['08012345678', '+2348012345678'],
    ['+234 801 234 5678', '+2348012345678'],
    ['2348012345678', '+2348012345678'],
    ['0801 234 5678', '+2348012345678'],
    ['12345', null],
    ['+14155550100', '+14155550100'],
  ];

  it.each(cases)('%s -> %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it('rejects foreign numbers when not allowed', () => {
    expect(normalisePhone('+14155550100', { allowForeign: false })).toBeNull();
    expect(normalisePhone('08012345678', { allowForeign: false })).toBe('+2348012345678');
  });

  it('normalisePhoneOrThrow throws on invalid input', () => {
    expect(() => normalisePhoneOrThrow('12345')).toThrow();
    expect(normalisePhoneOrThrow('08012345678')).toBe('+2348012345678');
  });
});
