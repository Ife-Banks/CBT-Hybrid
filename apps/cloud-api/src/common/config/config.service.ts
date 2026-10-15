import { Injectable } from '@nestjs/common';
import { Env, EnvSchema } from './config.schema';

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
