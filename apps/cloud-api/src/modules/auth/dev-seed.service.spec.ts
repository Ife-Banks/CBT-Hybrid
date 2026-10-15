import { afterEach, describe, expect, it } from 'vitest';
import { ConfigService } from '../../common/config/config.service';
import { LoggerService } from '../../shared/logger/logger.service';
import { DevSeedService } from './dev-seed.service';
import { PasswordService } from './password.service';
import { InMemoryUserRepository } from './repositories/user.repository';

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

/** Build a seeder from the current environment. */
function build(): { users: InMemoryUserRepository; service: DevSeedService } {
  const users = new InMemoryUserRepository();
  const service = new DevSeedService(
    new ConfigService(),
    new LoggerService(),
    new PasswordService(),
    users,
  );
  return { users, service };
}

const ADMIN = {
  email: 'Admin@School.NG',
  password: 'TestPassword123!',
  role: 'school_admin',
  fullName: 'Ada Okafor',
  schoolCode: 'GRA',
};

describe('DevSeedService', () => {
  it('does nothing when AUTH_DEV_SEED is unset', async () => {
    delete process.env.AUTH_DEV_SEED;
    const { users, service } = build();
    await service.onModuleInit();
    expect(await users.findByEmail('admin@school.ng')).toBeNull();
  });

  it('inserts accounts, normalising the email', async () => {
    setEnv('AUTH_DEV_SEED', JSON.stringify([ADMIN]));
    const { users, service } = build();
    await service.onModuleInit();

    const user = await users.findByEmail('admin@school.ng');
    expect(user).not.toBeNull();
    expect(user?.role).toBe('school_admin');
    expect(user?.fullName).toBe('Ada Okafor');
    expect(user?.school).toEqual({ id: 'school-1', code: 'GRA', name: 'Development School' });
    expect(await new PasswordService().verify(user!.passwordHash, ADMIN.password)).toBe(true);
  });

  it('skips accounts whose email is already present', async () => {
    setEnv('AUTH_DEV_SEED', JSON.stringify([ADMIN]));
    const { users, service } = build();
    await service.onModuleInit();
    await service.onModuleInit();

    expect(await users.listBySchool('school-1')).toHaveLength(1);
  });

  it('gives the platform owner no school', async () => {
    setEnv(
      'AUTH_DEV_SEED',
      JSON.stringify([
        { email: 'owner@platform.ng', password: 'TestPassword123!', role: 'platform_owner' },
      ]),
    );
    const { users, service } = build();
    await service.onModuleInit();

    const owner = await users.findByEmail('owner@platform.ng');
    expect(owner?.schoolId).toBeNull();
    expect(owner?.school).toBeNull();
  });

  it('is ignored in production', async () => {
    setEnv('AUTH_DEV_SEED', JSON.stringify([ADMIN]));
    setEnv('NODE_ENV', 'production');
    setEnv('SESSION_SECRET', 'x'.repeat(32));
    const { users, service } = build();
    await service.onModuleInit();
    expect(await users.findByEmail('admin@school.ng')).toBeNull();
  });

  it('rejects malformed seed JSON', async () => {
    setEnv('AUTH_DEV_SEED', 'not-json');
    await expect(build().service.onModuleInit()).rejects.toThrow(/JSON array/);

    setEnv('AUTH_DEV_SEED', '{"email":"a@b.ng"}');
    await expect(build().service.onModuleInit()).rejects.toThrow(/JSON array/);
  });

  it('rejects entries without a role, password or identifier', async () => {
    setEnv('AUTH_DEV_SEED', JSON.stringify([{ email: 'a@b.ng' }]));
    await expect(build().service.onModuleInit()).rejects.toThrow(/role.*password/);

    setEnv('AUTH_DEV_SEED', JSON.stringify([{ password: 'TestPassword123!', role: 'teacher' }]));
    await expect(build().service.onModuleInit()).rejects.toThrow(/email.*phone/);
  });

  it('rejects an entry whose password breaks the policy', async () => {
    setEnv(
      'AUTH_DEV_SEED',
      JSON.stringify([{ email: 'a@b.ng', password: 'short', role: 'teacher' }]),
    );
    await expect(build().service.onModuleInit()).rejects.toThrow(/invalid/);
  });
});
