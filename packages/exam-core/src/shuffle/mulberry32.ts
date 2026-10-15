/**
 * mulberry32 PRNG. This exact implementation is required: it is what makes a
 * resumed exam show the same question and option order (CBT-04 section 4.3).
 *
 * The reference function returns a float in [0, 1). We also expose the raw
 * 32-bit unsigned integer, which is what the specification's test vectors quote.
 */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateful mulberry32 generator. */
export class Mulberry32 {
  private a: number;

  constructor(seed: number) {
    this.a = seed | 0;
  }

  private step(): number {
    this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Next value as a 32-bit unsigned integer (0..4294967295). */
  next(): number {
    return this.step();
  }

  /** Next value as a float in [0, 1). */
  nextFloat(): number {
    return this.step() / 4294967296;
  }
}
