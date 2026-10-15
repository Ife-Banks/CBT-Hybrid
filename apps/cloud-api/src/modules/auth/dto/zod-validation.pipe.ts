import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { validationFailed } from '../http/errors';

/**
 * Validates a request part against a Zod schema from `@cbt/shared-types`
 * (API spec section 1.2: every body and query is validated with those schemas).
 * On failure it throws a `422 VALIDATION_FAILED` problem with an `errors[]`
 * array naming each field.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw validationFailed(
        result.error.issues.map((issue) => ({
          field: issue.path.map(String).join('.'),
          code: String(issue.code),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
