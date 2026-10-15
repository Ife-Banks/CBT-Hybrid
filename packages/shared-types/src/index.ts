import { z } from 'zod';

/** Semantic version placeholder for the package. */
export const VERSION = '0.0.0';

/**
 * Standard error envelope returned by the cloud API.
 *
 * Phase 0 placeholder. The complete schema set (every request, response, event
 * payload and error code from API spec sections 2-18) is built in Phase 1.
 */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    correlationId: z.string(),
  }),
  timestamp: z.string(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
