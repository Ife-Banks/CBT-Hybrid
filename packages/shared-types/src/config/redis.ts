import { z } from 'zod';

/**
 * Redis configuration. The cloud API uses a managed Redis (Upstash) by URL, so
 * {@link RedisUrlSchema} is the primary form; the host/port form is kept for
 * completeness (see `docs/questions.md` D.1).
 */

export const RedisUrlSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith('redis://') || value.startsWith('rediss://'), {
    message: 'REDIS_URL must be a redis:// or rediss:// URL',
  });

export const RedisConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  password: z.string().optional(),
  db: z.number().int().min(0).default(0),
});

export type RedisConfig = z.infer<typeof RedisConfigSchema>;
