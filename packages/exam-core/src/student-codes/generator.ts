import { randomInt } from 'node:crypto';
import { STUDENT_CODE_ALPHABET, STUDENT_CODE_ALPHABET_SIZE, alphabetIndex } from '../alphabet';

/** Length of the random body (the 8 characters before the check character). */
export const BODY_LENGTH = 8;

/** Length of `BODY8` + `CHECK`. */
export const CODE_BODY_LENGTH = 9;

/** School code: 3 to 6 capital letters or digits (API spec 12.1). */
const SCHOOL_CODE_PATTERN = /^[A-Z0-9]{3,6}$/;

/**
 * Compute the check character for an 8-character body.
 *
 * Weighted mod-31 checksum (CBT-04 section 4.1):
 *   sum   = Σ over i=1..8 of ( i × v(body[i]) )
 *   check = alphabet[ ( −sum × 7 ) mod 31 ]      // 7 is the inverse of 9 mod 31
 */
export function computeCheck(body: string): string {
  if (body.length !== BODY_LENGTH) {
    throw new Error(`computeCheck: body must be ${BODY_LENGTH} characters, got ${body.length}`);
  }

  let sum = 0;
  for (let i = 0; i < BODY_LENGTH; i += 1) {
    const char = body[i] as string;
    const value = alphabetIndex(char);
    if (value === undefined) {
      throw new Error(`computeCheck: invalid character "${char}" at position ${i + 1}`);
    }
    sum += (i + 1) * value;
  }

  const index =
    (((-sum * 7) % STUDENT_CODE_ALPHABET_SIZE) + STUDENT_CODE_ALPHABET_SIZE) %
    STUDENT_CODE_ALPHABET_SIZE;
  return STUDENT_CODE_ALPHABET[index] as string;
}

/**
 * Validate a 9-character `BODY8` + `CHECK` string: every character must be in
 * the alphabet and the weighted sum over positions 1..9 must be 0 modulo 31.
 */
export function isValidCodeBody(codeBody: string): boolean {
  if (codeBody.length !== CODE_BODY_LENGTH) return false;

  let sum = 0;
  for (let i = 0; i < CODE_BODY_LENGTH; i += 1) {
    const value = alphabetIndex(codeBody[i] as string);
    if (value === undefined) return false;
    sum += (i + 1) * value;
  }
  return sum % STUDENT_CODE_ALPHABET_SIZE === 0;
}

/**
 * Normalise user input: uppercase, then remove spaces and hyphens
 * (CBT-04 section 4.1).
 */
export function normalise(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/** Split a normalised full code into its school-code and body parts. */
export function parseCode(fullCode: string): { schoolCode: string; codeBody: string } | null {
  const normalised = normalise(fullCode);
  if (normalised.length < CODE_BODY_LENGTH + 3) return null;
  const schoolCode = normalised.slice(0, normalised.length - CODE_BODY_LENGTH);
  const codeBody = normalised.slice(-CODE_BODY_LENGTH);
  if (!SCHOOL_CODE_PATTERN.test(schoolCode)) return null;
  return { schoolCode, codeBody };
}

/**
 * Generate and validate student codes.
 *
 * Codes are unique per school and never reused (BR-08); collision handling is
 * the caller's responsibility (generate again on collision).
 */
export class StudentCodeGenerator {
  /** Generate an 8-character body using a cryptographically secure RNG. */
  generateBody(): string {
    let body = '';
    for (let i = 0; i < BODY_LENGTH; i += 1) {
      body += STUDENT_CODE_ALPHABET[randomInt(0, STUDENT_CODE_ALPHABET_SIZE)];
    }
    return body;
  }

  /** Check character for a body (see {@link computeCheck}). */
  computeCheckCharacter(body: string): string {
    return computeCheck(body);
  }

  /** Full 9-character `BODY8` + `CHECK`. */
  generateCodeBody(): string {
    const body = this.generateBody();
    return body + computeCheck(body);
  }

  /** Format a full code as `<SCHOOL>-<BODY8><CHECK>`. */
  formatCode(schoolCode: string, body: string): string {
    if (!SCHOOL_CODE_PATTERN.test(schoolCode)) {
      throw new Error(`formatCode: invalid school code "${schoolCode}"`);
    }
    return `${schoolCode}-${body}${computeCheck(body)}`;
  }

  /** Format a full code from an already-computed 9-character code body. */
  formatFullCode(schoolCode: string, codeBody: string): string {
    if (!SCHOOL_CODE_PATTERN.test(schoolCode)) {
      throw new Error(`formatCode: invalid school code "${schoolCode}"`);
    }
    if (!isValidCodeBody(codeBody)) {
      throw new Error(`formatCode: invalid code body "${codeBody}"`);
    }
    return `${schoolCode}-${codeBody}`;
  }
}

/** Validate full student codes. */
export class StudentCodeValidator {
  /** True when the full code (with school code and check character) is valid. */
  validateCode(fullCode: string): boolean {
    const parsed = parseCode(fullCode);
    if (!parsed) return false;
    return isValidCodeBody(parsed.codeBody);
  }

  /** True when a 9-character code body is valid. */
  validateCodeBody(codeBody: string): boolean {
    return isValidCodeBody(codeBody);
  }
}
