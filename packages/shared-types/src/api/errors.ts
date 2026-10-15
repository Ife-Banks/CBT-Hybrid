import { z } from 'zod';

/**
 * The error envelope used by every cloud and school endpoint.
 *
 * This follows API and Sync Specification section 1.4 (`application/problem+json`,
 * RFC 9457) rather than the ad-hoc shape sketched in the Phase 1 plan: the
 * `code` field and `request_id` are required and stable. See `docs/questions.md`
 * (D.5) for the divergence note.
 */

/** A single field-level validation error. */
export const FieldErrorSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
});

export type FieldError = z.infer<typeof FieldErrorSchema>;

/** `application/problem+json` response body. */
export const ProblemDetailsSchema = z.object({
  /** URI reference identifying the problem type. */
  type: z.string(),
  /** Short, human-readable summary. */
  title: z.string(),
  /** HTTP status code. */
  status: z.number().int(),
  /** Stable machine-readable error code from the catalogue. */
  code: z.string(),
  /** Human-readable explanation for this occurrence. */
  detail: z.string().optional(),
  /** Field-level errors, for validation failures. */
  errors: z.array(FieldErrorSchema).optional(),
  /** Correlation id, also present in the logs. */
  request_id: z.string(),
});

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

/** Content type required for error responses. */
export const PROBLEM_JSON_CONTENT_TYPE = 'application/problem+json';
