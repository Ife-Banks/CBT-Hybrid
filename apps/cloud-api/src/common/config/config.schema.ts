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

/** Empty-string-tolerant optional secret, for `.env` files with blank values. */
const optionalSecret = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.string().min(16).optional(),
);

/**
 * Environment schema for the cloud API (CBT-04 section 11.1). Validated once at
 * startup; the process fails fast if anything is invalid.
 *
 * External services are optional in Phase 1 (they become required in Phase 3
 * when the database and Redis are wired in). Missing ones make the corresponding
 * health check report `degraded`, never `error`.
 */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    /** Canonical port (what a cloud host injects). */
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    /** Optional local override so both servers can run from one `.env`. */
    CLOUD_API_PORT: optionalPort,
    /** Canonical public base URL. */
    PUBLIC_URL: z.string().url().default('http://localhost:3000'),
    CLOUD_API_PUBLIC_URL: optionalUrl,

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    // Data stores (Phase 3+)
    DATABASE_URL: z.string().optional(),
    DATABASE_URL_PLATFORM: z.string().optional(),
    REDIS_URL: z.string().optional(),

    // Sessions and sign-in (Phase 2; API spec sections 3 and 20)
    /** Signs the CSRF token. Required in production; a dev placeholder otherwise. */
    SESSION_SECRET: optionalSecret,
    /** Staff session lifetime (API spec section 20: 12 hours). */
    SESSION_TTL_STAFF_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(12 * 60 * 60),
    /** Parent session lifetime (API spec section 20: 30 days, sliding). */
    SESSION_TTL_PARENT_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(30 * 24 * 60 * 60),
    /** Failed sign-ins before the account locks (API spec section 20: 5). */
    ACCOUNT_LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(5),
    /** Lock duration in seconds (API spec section 20: 15 minutes). */
    ACCOUNT_LOCKOUT_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60),
    /** One-time code lifetime in seconds (API spec section 20: 10 minutes). */
    OTP_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 60),
    /** Wrong one-time codes before the challenge locks (API spec section 20: 5). */
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    /** Minimum seconds between one-time code resends (API spec section 20: 60). */
    OTP_RESEND_SECONDS: z.coerce.number().int().positive().default(60),
    /** Sign-in attempts per IP per window (API spec section 1.7: 10/minute). */
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    /**
     * Development-only: a JSON array of accounts to insert at startup. Ignored
     * in production. Phase 2 has no registration endpoint and keeps users in
     * memory, so this is how a local instance gets its first sign-in. Example:
     * `[{"email":"admin@school.ng","password":"…","role":"school_admin"}]`
     */
    AUTH_DEV_SEED: z.string().optional(),

    // HTTP behaviour
    BODY_LIMIT: z.string().default('10mb'),
    CORS_ORIGINS: z.string().optional(),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.SESSION_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET is required in production',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;
