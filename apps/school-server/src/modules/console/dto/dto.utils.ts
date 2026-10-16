import { z, type ZodType } from 'zod';
import { problem } from '../../../common/http/problem';

export function zodOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const detail = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  throw problem('VALIDATION_FAILED', detail);
}
