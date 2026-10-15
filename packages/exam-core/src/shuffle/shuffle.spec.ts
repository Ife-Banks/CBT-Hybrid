import { describe, expect, it } from 'vitest';
import {
  DeterministicShuffler,
  optionSeed,
  orderForSession,
  shuffle,
} from './deterministic-shuffler';
import { hash32 } from './hash32';
import { Mulberry32, mulberry32 } from './mulberry32';

describe('mulberry32 (section 4.3 vectors)', () => {
  it('produces the exact first three integers for seed 12345', () => {
    const rng = new Mulberry32(12345);
    expect([rng.next(), rng.next(), rng.next()]).toEqual([4207900869, 1317490944, 2079646450]);
  });

  it('the functional form matches the class form', () => {
    const rnd = mulberry32(12345);
    const expected = [4207900869, 1317490944, 2079646450].map((n) => n / 4294967296);
    for (const value of expected) {
      expect(rnd()).toBeCloseTo(value, 12);
    }
  });
});

describe('hash32 (section 4.3 vector)', () => {
  it('hashes q-001 to the exact value', () => {
    expect(hash32('q-001')).toBe(3036902622);
  });
});

describe('shuffle (section 4.3 vectors)', () => {
  it('shuffles A..J with seed 12345 to GEIABHFDCJ', () => {
    const input = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    expect(shuffle(input, 12345).join('')).toBe('GEIABHFDCJ');
  });

  it('does not mutate the input array', () => {
    const input = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const copy = [...input];
    shuffle(input, 12345);
    expect(input).toEqual(copy);
  });

  it('derives the option seed for q-001 from session seed 12345', () => {
    expect(optionSeed(12345, 'q-001')).toBe(3036890343);
  });

  it('shuffles A..D with the option seed to ADBC', () => {
    expect(shuffle(['A', 'B', 'C', 'D'], 3036890343).join('')).toBe('ADBC');
  });

  it('is deterministic and a permutation', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const first = shuffle(items, 42);
    const second = DeterministicShuffler.shuffle(items, 42);
    expect(first).toEqual(second);
    expect([...first].sort((a, b) => a - b)).toEqual(items);
  });

  it('orderForSession delegates to shuffle', () => {
    expect(
      orderForSession(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], 12345).join(''),
    ).toBe('GEIABHFDCJ');
  });
});
