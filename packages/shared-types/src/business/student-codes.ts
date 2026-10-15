import { z } from 'zod';

/**
 * Student-code shapes.
 *
 * The alphabet is the authoritative 31-character set from CBT-04 section 4.1
 * (no `0 1 I L O`). The Phase 1 plan's regex included `L`; that is a documentation
 * typo, recorded in `docs/questions.md` (D.6).
 *
 * NOTE: these schemas check the *shape* only. The weighted check character is
 * verified by `@cbt/exam-core` (`isValidCodeBody`), which is the single source
 * of truth for validity.
 */
export const STUDENT_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

const ALPHABET_CHAR = '[23456789ABCDEFGHJKMNPQRSTUVWXYZ]';

/** A school code: 3 to 6 capital letters or digits. */
export const SchoolCodeSchema = z.string().regex(/^[A-Z0-9]{3,6}$/);

/** A full student code in `<SCHOOL>-<BODY8><CHECK>` form. */
export const StudentCodeSchema = z
  .string()
  .regex(new RegExp(`^[A-Z0-9]{3,6}-${ALPHABET_CHAR}{9}$`));

/** Six-digit exam key, leading zeros allowed. */
export const ExamKeySchema = z.string().regex(/^\d{6}$/);

export type StudentCode = z.infer<typeof StudentCodeSchema>;
export type SchoolCode = z.infer<typeof SchoolCodeSchema>;
export type ExamKey = z.infer<typeof ExamKeySchema>;
