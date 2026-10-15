/**
 * `@cbt/shared-types` - Zod schemas, TypeScript types, error codes and
 * permission names shared across the platform.
 *
 * Scope note: the full set of request/response schemas for API and Sync
 * Specification sections 2-18 is added alongside each endpoint as it is built.
 * This package provides the cross-cutting pieces (errors, health, pagination,
 * config, student codes, exam primitives, permissions) needed by Phase 1.
 */

export * from './api/errors';
export * from './api/health';
export * from './api/pagination';
export * from './auth/abilities';
export * from './auth/password-policy';
export * from './auth/schemas';
export * from './business/exams';
export * from './business/student-codes';
export * from './config/database';
export * from './config/redis';
export * from './errors/error-codes';
export * from './permissions';
export * from './util/ids';

/** Semantic version placeholder for the package. */
export const VERSION = '0.0.0';
