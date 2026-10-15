import { z } from 'zod';

/** Empty-string-tolerant optional port, for `.env` files with blank values. */
const optionalPort = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.coerce.number().int().min(1).max(65535).optional(),
);

/** Empty-string-tolerant optional URL. */
const optionalUrl = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.string().url().optional(),
);

/**
 * Environment schema for the cloud API (CBT-04 section 11.1). Validated once at
 * startup; the process fails fast if anything is invalid.
 *
 * External services are optional in Phase 1 (they become required in Phase 3
 * when the database and Redis are wired in). Missing ones make the corresponding
 * health check report `degraded`, never `error`.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  /** Canonical port (what a cloud host injects). */
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Optional local override so both servers can run from one `.env`. */
  CLOUD_API_PORT: optionalPort,
  /** Canonical public base URL. */
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  CLOUD_API_PUBLIC_URL: optionalUrl,

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Data stores (Phase 3+)
  DATABASE_URL: z.string().optional(),
  DATABASE_URL_PLATFORM: z.string().optional(),
  REDIS_URL: z.string().optional(),

  // Sessions (Phase 2+)
  SESSION_SECRET: z.string().min(16).optional(),

  // HTTP behaviour
  BODY_LIMIT: z.string().default('10mb'),
  CORS_ORIGINS: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
});

export type Env = z.infer<typeof EnvSchema>;
