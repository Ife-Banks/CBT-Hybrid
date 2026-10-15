/**
 * `@cbt/exam-core` - pure, deterministic CBT algorithms shared by the cloud API
 * and the school server. No I/O and no Node-only APIs except `node:crypto`.
 */
export * from './alphabet';
export * from './answers/types';
export * from './crypto/exam-crypto';
export * from './crypto/hkdf';
export * from './crypto/pin-reset';
export * from './crypto/request-signing';
export * from './crypto/sha256';
export * from './exam-key/exam-key';
export * from './marking/marking-engine';
export * from './phone/phone';
export * from './shuffle/deterministic-shuffler';
export * from './shuffle/hash32';
export * from './shuffle/mulberry32';
export * from './student-codes/generator';

/** Semantic version placeholder for the package. */
export const VERSION = '0.0.0';
