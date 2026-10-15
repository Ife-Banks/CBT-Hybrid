import { afterEach, describe, expect, it } from 'vitest';
import { ConfigService, loadEnv } from './config.service';

/** Save/restore env keys touched by a test. */
const originals = new Map<string, string | undefined>();
function setEnv(key: string, value: string): void {
  if (!originals.has(key)) originals.set(key, process.env[key]);
  process.env[key] = value;
}
afterEach(() => {
  for (const [key, value] of originals) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  originals.clear();
});

describe('loadEnv (configuration validation)', () => {
  it('applies defaults for an empty environment', () => {
    const env = loadEnv({} as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.RATE_LIMIT_MAX).toBe(100);
  });

  it('coerces numeric values', () => {
    const env = loadEnv({ PORT: '8080', RATE_LIMIT_MAX: '250' } as unknown as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(8080);
    expect(env.RATE_LIMIT_MAX).toBe(250);
  });

  it('treats blank optional overrides as unset', () => {
    const env = loadEnv({
      CLOUD_API_PORT: '',
      CLOUD_API_PUBLIC_URL: '',
    } as unknown as NodeJS.ProcessEnv);
    expect(env.CLOUD_API_PORT).toBeUndefined();
    expect(env.CLOUD_API_PUBLIC_URL).toBeUndefined();
  });

  it('fails fast on invalid configuration', () => {
    expect(() => loadEnv({ PORT: 'not-a-number' } as unknown as NodeJS.ProcessEnv)).toThrow(
      /Invalid environment configuration/,
    );
    expect(() => loadEnv({ PORT: '70000' } as unknown as NodeJS.ProcessEnv)).toThrow();
    expect(() => loadEnv({ LOG_LEVEL: 'loud' } as unknown as NodeJS.ProcessEnv)).toThrow();
  });
});

describe('ConfigService.port / publicUrl', () => {
  it('falls back to PORT and PUBLIC_URL', () => {
    const config = new ConfigService();
    expect(config.port).toBe(3000);
    expect(config.publicUrl).toBe('http://localhost:3000');
  });

  it('prefers the app-specific overrides when set', () => {
    setEnv('CLOUD_API_PORT', '4111');
    setEnv('CLOUD_API_PUBLIC_URL', 'http://localhost:4111');
    const config = new ConfigService();
    expect(config.port).toBe(4111);
    expect(config.publicUrl).toBe('http://localhost:4111');
  });
});

describe('ConfigService auth settings', () => {
  it('exposes the Phase 2 limits with the API spec defaults (section 20)', () => {
    expect(new ConfigService().auth).toEqual({
      staffSessionTtlSeconds: 12 * 60 * 60,
      parentSessionTtlSeconds: 30 * 24 * 60 * 60,
      lockoutThreshold: 5,
      lockoutSeconds: 15 * 60,
      otpTtlSeconds: 10 * 60,
      otpMaxAttempts: 5,
      otpResendSeconds: 60,
      loginRateLimitMax: 10,
      loginRateLimitWindowMs: 60_000,
    });
  });

  it('reads the limits from the environment when provided', () => {
    setEnv('SESSION_TTL_STAFF_SECONDS', '60');
    setEnv('ACCOUNT_LOCKOUT_THRESHOLD', '3');
    setEnv('OTP_MAX_ATTEMPTS', '2');
    const config = new ConfigService();
    expect(config.auth.staffSessionTtlSeconds).toBe(60);
    expect(config.auth.lockoutThreshold).toBe(3);
    expect(config.auth.otpMaxAttempts).toBe(2);
    // Untouched values keep their defaults.
    expect(config.auth.parentSessionTtlSeconds).toBe(30 * 24 * 60 * 60);
  });

  it('uses a development secret unless one is supplied', () => {
    const fallback = new ConfigService();
    expect(fallback.hasExplicitSessionSecret).toBe(false);
    expect(fallback.sessionSecret).toContain('development-only');

    setEnv('SESSION_SECRET', 'an-explicit-secret-value');
    const explicit = new ConfigService();
    expect(explicit.hasExplicitSessionSecret).toBe(true);
    expect(explicit.sessionSecret).toBe('an-explicit-secret-value');
  });

  it('treats a blank SESSION_SECRET as unset', () => {
    setEnv('SESSION_SECRET', '');
    const config = new ConfigService();
    expect(config.hasExplicitSessionSecret).toBe(false);
    expect(config.sessionSecret).toContain('development-only');
  });

  it('requires an explicit session secret in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toThrow(
      /SESSION_SECRET/,
    );
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        SESSION_SECRET: '',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/SESSION_SECRET/);
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        SESSION_SECRET: 'x'.repeat(32),
      } as unknown as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('marks cookies Secure in production and for an HTTPS public URL', () => {
    expect(new ConfigService().cookieSecure).toBe(false);

    setEnv('NODE_ENV', 'production');
    setEnv('SESSION_SECRET', 'x'.repeat(32));
    expect(new ConfigService().cookieSecure).toBe(true);

    setEnv('NODE_ENV', 'development');
    setEnv('CLOUD_API_PUBLIC_URL', 'https://cbt.example.ng');
    expect(new ConfigService().cookieSecure).toBe(true);

    setEnv('CLOUD_API_PUBLIC_URL', 'http://localhost:3000');
    expect(new ConfigService().cookieSecure).toBe(false);
  });
});
