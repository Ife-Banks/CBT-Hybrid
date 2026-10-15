import { afterEach, describe, expect, it } from 'vitest';
import { ConfigService, loadEnv } from './config.service';

/** Save/restore env keys touched by a test. */
const touched: string[] = [];
function setEnv(key: string, value: string): void {
  if (!touched.includes(key)) touched.push(key);
  process.env[key] = value;
}
afterEach(() => {
  for (const key of touched.splice(0)) delete process.env[key];
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
