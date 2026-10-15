/**
 * CBT exam core: pure, deterministic algorithms shared by the cloud API and the
 * school server.
 *
 * Phase 0 placeholder. The algorithms (student codes, exam keys, mulberry32
 * shuffle, marking, exam packs, sync signing) and their exact test vectors from
 * `CBT-04-Build-Specification.md` section 4 are implemented in Phase 1.
 */
export const VERSION = '0.0.0';

/** Safe alphabet used for student-code bodies (excludes I, L, O, 0, 1). */
export const STUDENT_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' as const;
