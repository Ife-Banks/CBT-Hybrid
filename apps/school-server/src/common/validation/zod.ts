import { type ZodType } from 'zod';
import { problem } from '../http/problem';

/**
 * Parse a request body against a zod schema, turning a failure into the
 * `VALIDATION_FAILED` problem response (API spec 1.4).
 */
export function zodOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const detail = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  throw problem('VALIDATION_FAILED', detail);
}
