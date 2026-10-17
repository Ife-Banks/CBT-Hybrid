import { z } from 'zod';

/** Query parameters for `GET /audit-logs` (API spec 11.4). */
export const auditLogQuerySchema = z.object({
  actor_id: z.string().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export type AuditLogQueryDto = z.infer<typeof auditLogQuerySchema>;
