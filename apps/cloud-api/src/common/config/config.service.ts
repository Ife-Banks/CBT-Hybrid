import { Injectable } from '@nestjs/common';
import { Env, EnvSchema } from './config.schema';

/** Placeholder secret used outside production when `SESSION_SECRET` is unset. */
const DEV_SESSION_SECRET = 'development-only-session-secret-do-not-use';

/** Sign-in and session settings resolved from the environment. */
export interface AuthConfig {
  staffSessionTtlSeconds: number;
  parentSessionTtlSeconds: number;
  lockoutThreshold: number;
  lockoutSeconds: number;
  otpTtlSeconds: number;
  otpMaxAttempts: number;
  otpResendSeconds: number;
  loginRateLimitMax: number;
  loginRateLimitWindowMs: number;
}

/**
 * Validate an environment source and return typed config. Throws on the first
 * invalid value so the process can fail fast. Exported separately from the
 * service so it can be unit tested without Nest's dependency injection.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

/**
 * Typed, validated access to environment configuration. Constructed once at
 * startup; validation failures throw and stop the process.
 */
@Injectable()
export class ConfigService {
  private readonly env: Env;

  constructor() {
    this.env = loadEnv(process.env);
  }

  /** Read a single configuration value. */
  get<K extends keyof Env>(key: K): Env[K] {
    return this.env[key];
  }

  /** Port to bind, preferring the local `CLOUD_API_PORT` override. */
  get port(): number {
    return this.env.CLOUD_API_PORT ?? this.env.PORT;
  }

  /** Public base URL, preferring the local `CLOUD_API_PUBLIC_URL` override. */
  get publicUrl(): string {
    return this.env.CLOUD_API_PUBLIC_URL ?? this.env.PUBLIC_URL;
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }

  /**
   * Secret that signs CSRF tokens. Production requires an explicit value (the
   * schema rejects a missing one when `NODE_ENV=production`); development and
   * test fall back to a fixed placeholder so the app boots without extra setup.
   * The fallback is deliberately obvious so it never reaches production.
   */
  get sessionSecret(): string {
    return this.env.SESSION_SECRET ?? DEV_SESSION_SECRET;
  }

  /** True when a session secret was supplied rather than defaulted. */
  get hasExplicitSessionSecret(): boolean {
    return this.env.SESSION_SECRET !== undefined;
  }

  /** Cookies are `Secure` in production or when the public URL is HTTPS. */
  get cookieSecure(): boolean {
    return this.isProduction || this.publicUrl.startsWith('https://');
  }

  /** Sign-in, session, lockout and one-time-code settings (Phase 2). */
  get auth(): AuthConfig {
    return {
      staffSessionTtlSeconds: this.env.SESSION_TTL_STAFF_SECONDS,
      parentSessionTtlSeconds: this.env.SESSION_TTL_PARENT_SECONDS,
      lockoutThreshold: this.env.ACCOUNT_LOCKOUT_THRESHOLD,
      lockoutSeconds: this.env.ACCOUNT_LOCKOUT_SECONDS,
      otpTtlSeconds: this.env.OTP_TTL_SECONDS,
      otpMaxAttempts: this.env.OTP_MAX_ATTEMPTS,
      otpResendSeconds: this.env.OTP_RESEND_SECONDS,
      loginRateLimitMax: this.env.LOGIN_RATE_LIMIT_MAX,
      loginRateLimitWindowMs: this.env.LOGIN_RATE_LIMIT_WINDOW_MS,
    };
  }

  /** Raw `AUTH_DEV_SEED` JSON, or undefined. Ignored in production. */
  get devSeedUsers(): string | undefined {
    return this.env.AUTH_DEV_SEED;
  }

  /** Allowed CORS origins. `true` reflects the request origin in development. */
  get corsOrigins(): string[] | boolean {
    const raw = this.env.CORS_ORIGINS;
    if (!raw) return this.env.NODE_ENV === 'production' ? [] : true;
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }
}
