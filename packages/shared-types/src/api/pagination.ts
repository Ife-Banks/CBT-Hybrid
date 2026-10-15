import { z } from 'zod';

/**
 * Cursor pagination (API and Sync Specification section 1.5). Every list
 * endpoint returns `{ data, next_cursor, total }`; `limit` defaults to 50 and
 * is capped at 200.
 */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** Build a paginated response schema for a given item schema. */
export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    next_cursor: z.string().nullable(),
    total: z.number().int().optional(),
  });
}

export interface Paginated<T> {
  data: T[];
  next_cursor: string | null;
  total?: number;
}
