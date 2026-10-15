import { z } from 'zod';

/**
 * Database configuration.
 *
 * The cloud API connects to a managed Postgres (Neon) by connection string, so
 * {@link DatabaseUrlSchema} is what the app actually consumes. The host/port
 * form is kept because the Phase 1 plan and the school-server tooling refer to
 * it (see `docs/questions.md` D.1).
 */

export const DatabaseUrlSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
    message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
  });

export const DatabaseConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1),
  password: z.string().min(1),
  database: z.string().min(1),
  ssl: z.boolean().default(false),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
