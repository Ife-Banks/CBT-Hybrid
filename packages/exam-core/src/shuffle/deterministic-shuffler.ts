import { hash32 } from './hash32';
import { mulberry32 } from './mulberry32';

/**
 * Deterministic Fisher-Yates shuffle driven by mulberry32 (CBT-04 section 4.3).
 * Returns a new array; the input is not modified.
 */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const rnd = mulberry32(seed);
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}

/** Class wrapper for callers that prefer a static entry point. */
export class DeterministicShuffler {
  static shuffle<T>(items: readonly T[], seed: number): T[] {
    return shuffle(items, seed);
  }
}

/** Option seed for a question: `(sessionSeed ^ hash32(questionId)) >>> 0`. */
export function optionSeed(sessionSeed: number, questionId: string): number {
  return (sessionSeed ^ hash32(questionId)) >>> 0;
}

/**
 * Question order for a session. Questions must already carry a stable
 * `questionId` so option ordering can be derived per question.
 */
export function orderForSession<T>(questions: readonly T[], seed: number): T[] {
  return shuffle(questions, seed);
}
