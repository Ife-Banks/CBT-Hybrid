/**
 * Student-code alphabet: exactly 31 characters. It excludes `0`, `1`, `I`, `L`
 * and `O` so a code can be read aloud or copied by hand without ambiguity
 * (CBT-04 Build Specification section 4.1).
 */
export const STUDENT_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Number of characters in the alphabet (31). */
export const STUDENT_CODE_ALPHABET_SIZE = STUDENT_CODE_ALPHABET.length;

const INDEX: ReadonlyMap<string, number> = new Map(
  [...STUDENT_CODE_ALPHABET].map((char, i) => [char, i] as const),
);

/** Index of a character in the alphabet (0..30), or `undefined` if invalid. */
export function alphabetIndex(char: string): number | undefined {
  return INDEX.get(char);
}
