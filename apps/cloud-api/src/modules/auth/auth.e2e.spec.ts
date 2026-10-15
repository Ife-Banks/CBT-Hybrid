import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RequestMethod, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { generate } from 'otplib';
import { AppModule } from '../../app.module';
import { PasswordService } from './password.service';
import { ClockService } from './clock.service';
import { USER_REPOSITORY, InMemoryUserRepository } from './repositories/user.repository';
import { SESSION_REPOSITORY, InMemorySessionRepository } from './repositories/session.repository';
import {
  OTP_CHALLENGE_REPOSITORY,
  InMemoryOtpChallengeRepository,
} from './repositories/otp.repository';
import { NOTIFIER } from './notifier';
import { CapturingNotifier, FakeClock, seedUser } from './testing/auth.fixture';

const PASSWORD = 'TestPassword123!';
const STRONG_PASSWORD = 'Even-Better-Passphrase-9';

interface HeaderBag {
  headers: Record<string, string | string[] | undefined>;
}

/** Parse the `Set-Cookie` header of a response into a name/value map. */
function setCookies(response: HeaderBag): Record<string, string> {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const result: Record<string, string> = {};
  for (const entry of list) {
    const pair = entry.split(';')[0] ?? '';
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    result[pair.slice(0, separator)] = pair.slice(separator + 1);
  }
  return result;
}

/** The raw `Set-Cookie` line for a cookie, for inspecting its attributes. */
function rawCookie(response: HeaderBag, name: string): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.find((entry) => entry.startsWith(`${name}=`)) ?? '';
}

/** The Express server handle supertest wraps. */
type HttpServer = NonNullable<Parameters<typeof request.agent>[0]>;

describe('auth (e2e)', () => {
  let app: INestApplication;
  let server: HttpServer;
  let users: InMemoryUserRepository;
  let sessions: InMemorySessionRepository;
  let challenges: InMemoryOtpChallengeRepository;
  let notifier: CapturingNotifier;
  let clock: FakeClock;
  let passwords: PasswordService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.SESSION_SECRET;

    users = new InMemoryUserRepository();
    sessions = new InMemorySessionRepository();
    challenges = new InMemoryOtpChallengeRepository();
    notifier = new CapturingNotifier();
    clock = new FakeClock();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(USER_REPOSITORY)
      .useValue(users)
      .overrideProvider(SESSION_REPOSITORY)
      .useValue(sessions)
      .overrideProvider(OTP_CHALLENGE_REPOSITORY)
      .useValue(challenges)
      .overrideProvider(NOTIFIER)
      .useValue(notifier)
      .overrideProvider(ClockService)
      .useValue(clock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: [{ path: 'health', method: RequestMethod.GET }],
    });
    await app.init();
    server = app.getHttpServer();
    passwords = app.get(PasswordService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    users.clear();
    sessions.clear();
    challenges.clear();
    notifier.clear();
    clock.reset();
  });

  const login = (
    agent: ReturnType<typeof request.agent>,
    identifier: string,
    password: string,
    totp?: string,
  ) =>
    agent
      .post('/api/v1/auth/login')
      .send(totp ? { identifier, password, totp } : { identifier, password });

  describe('POST /auth/login', () => {
    it('signs in and sets an HttpOnly session cookie plus a readable CSRF cookie', async () => {
      await seedUser(users, passwords, { role: 'school_admin', email: 'ada@school.ng' });
      const agent = request.agent(server);

      const response = await login(agent, 'ada@school.ng', PASSWORD);

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        role: 'school_admin',
        full_name: 'Ada Okafor',
        must_change_password: false,
        school: { code: 'GRA' },
      });
      expect(response.body.csrf_token).toBeTruthy();

      const cookies = setCookies(response);
      expect(cookies.cbt_session).toBeTruthy();
      expect(cookies.cbt_csrf).toBe(response.body.csrf_token);

      const sessionCookie = rawCookie(response, 'cbt_session');
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('SameSite=Lax');
      expect(sessionCookie).toContain('Path=/');
      expect(rawCookie(response, 'cbt_csrf')).not.toContain('HttpOnly');
    });

    it('rejects an unknown account and a wrong password with the same code', async () => {
      await seedUser(users, passwords, { email: 'ada@school.ng' });

      const unknown = await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: 'nobody@school.ng', password: PASSWORD });
      const wrong = await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: 'ada@school.ng', password: 'definitely-wrong' });

      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('validates the body', async () => {
      const response = await request(server).post('/api/v1/auth/login').send({ identifier: '' });
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(response.body.errors.length).toBeGreaterThan(0);
    });

    it('locks after five failed attempts and recovers after the lockout window', async () => {
      await seedUser(users, passwords, { email: 'ada@school.ng' });

      let last: { status: number; body: Record<string, unknown> } | undefined;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        last = await request(server)
          .post('/api/v1/auth/login')
          .send({ identifier: 'ada@school.ng', password: 'wrong' });
      }

      expect(last?.status).toBe(423);
      expect(last?.body.code).toBe('ACCOUNT_LOCKED');
      expect(last?.body.locked_until).toBeTruthy();

      // Correct password is refused while locked.
      const locked = await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: 'ada@school.ng', password: PASSWORD });
      expect(locked.status).toBe(423);

      clock.advanceMs(15 * 60 * 1000 + 1);
      const recovered = await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: 'ada@school.ng', password: PASSWORD });
      expect(recovered.status).toBe(200);
    });
  });

  describe('GET /auth/me', () => {
    it('requires a session', async () => {
      const response = await request(server).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('AUTH_REQUIRED');
    });

    it('returns the signed-in user, licence state and CSRF token', async () => {
      await seedUser(users, passwords, { email: 'ada@school.ng', role: 'teacher' });
      const agent = request.agent(server);
      await login(agent, 'ada@school.ng', PASSWORD);

      const response = await agent.get('/api/v1/auth/me');
      expect(response.status).toBe(200);
      expect(response.body.user.role).toBe('teacher');
      expect(response.body.licence.state).toBe('active');
      expect(response.body.csrf_token).toBeTruthy();
    });

    it('rejects a session whose user has been suspended', async () => {
      const user = await seedUser(users, passwords, { email: 'ada@school.ng' });
      const agent = request.agent(server);
      await login(agent, 'ada@school.ng', PASSWORD);

      user.status = 'suspended';
      await users.save(user);

      const response = await agent.get('/api/v1/auth/me');
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('CSRF protection', () => {
    it('rejects an unsafe request without the header and accepts it with the token', async () => {
      await seedUser(users, passwords, { email: 'ada@school.ng' });
      const agent = request.agent(server);
      const loginResponse = await login(agent, 'ada@school.ng', PASSWORD);
      const csrf = loginResponse.body.csrf_token as string;

      const missing = await agent.post('/api/v1/auth/logout');
      expect(missing.status).toBe(403);
      expect(missing.body.code).toBe('FORBIDDEN');

      const wrong = await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', 'nope');
      expect(wrong.status).toBe(403);

      const ok = await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrf);
      expect(ok.status).toBe(204);

      const after = await agent.get('/api/v1/auth/me');
      expect(after.status).toBe(401);
    });
  });

  describe('sessions', () => {
    it('lists active sessions and lets one device sign out another', async () => {
      const user = await seedUser(users, passwords, { email: 'ada@school.ng' });
      const first = request.agent(server);
      const second = request.agent(server);
      await login(first, 'ada@school.ng', PASSWORD);
      await login(second, 'ada@school.ng', PASSWORD);

      const list = await first.get('/api/v1/auth/sessions');
      expect(list.status).toBe(200);
      expect(list.body.sessions).toHaveLength(2);
      expect(list.body.sessions.filter((row: { current: boolean }) => row.current)).toHaveLength(1);

      const other = list.body.sessions.find((row: { current: boolean }) => !row.current);
      const csrf = (await first.get('/api/v1/auth/me')).body.csrf_token as string;
      const deleted = await first
        .delete(`/api/v1/auth/sessions/${other.id}`)
        .set('X-CSRF-Token', csrf);
      expect(deleted.status).toBe(204);

      expect((await second.get('/api/v1/auth/me')).status).toBe(401);
      expect((await first.get('/api/v1/auth/me')).status).toBe(200);
      expect(user.id).toBeTruthy();
    });
  });

  describe('POST /auth/password/change', () => {
    it('enforces the policy and revokes other sessions', async () => {
      await seedUser(users, passwords, { email: 'ada@school.ng' });
      const first = request.agent(server);
      const second = request.agent(server);
      await login(first, 'ada@school.ng', PASSWORD);
      await login(second, 'ada@school.ng', PASSWORD);

      const csrf = (await first.get('/api/v1/auth/me')).body.csrf_token as string;

      const weak = await first
        .post('/api/v1/auth/password/change')
        .set('X-CSRF-Token', csrf)
        .send({ current_password: PASSWORD, new_password: 'password123' });
      expect(weak.status).toBe(422);
      expect(weak.body.code).toBe('VALIDATION_FAILED');
      expect(weak.body.errors[0].code).toBe('TOO_COMMON');

      const changed = await first
        .post('/api/v1/auth/password/change')
        .set('X-CSRF-Token', csrf)
        .send({ current_password: PASSWORD, new_password: STRONG_PASSWORD });
      expect(changed.status).toBe(204);

      // The other device is signed out; this one stays.
      expect((await second.get('/api/v1/auth/me')).status).toBe(401);
      expect((await first.get('/api/v1/auth/me')).status).toBe(200);

      const oldPassword = await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: 'ada@school.ng', password: PASSWORD });
      expect(oldPassword.status).toBe(401);

      const newPassword = await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: 'ada@school.ng', password: STRONG_PASSWORD });
      expect(newPassword.status).toBe(200);
    });
  });

  describe('password reset', () => {
    it('runs the forgot-then-reset flow with attempt limiting', async () => {
      await seedUser(users, passwords, { email: 'ada@school.ng' });

      const forgot = await request(server)
        .post('/api/v1/auth/password/forgot')
        .send({ identifier: 'ada@school.ng' });
      expect(forgot.status).toBe(202);
      const challengeId = forgot.body.challenge_id as string;
      expect(challengeId).toBeTruthy();

      const code = notifier.lastCode();
      expect(code).toMatch(/^[0-9]{6}$/);

      const wrongCode = code === '000000' ? '111111' : '000000';
      const wrong = await request(server)
        .post('/api/v1/auth/password/reset')
        .send({ challenge_id: challengeId, code: wrongCode, new_password: STRONG_PASSWORD });
      expect(wrong.status).toBe(400);
      expect(wrong.body.code).toBe('OTP_INVALID');
      expect(wrong.body.attempts_left).toBe(4);

      const reset = await request(server)
        .post('/api/v1/auth/password/reset')
        .send({ challenge_id: challengeId, code: code!, new_password: STRONG_PASSWORD });
      expect(reset.status).toBe(204);

      const reused = await request(server)
        .post('/api/v1/auth/password/reset')
        .send({ challenge_id: challengeId, code: code!, new_password: STRONG_PASSWORD });
      expect(reused.status).toBe(400);

      const signedIn = await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: 'ada@school.ng', password: STRONG_PASSWORD });
      expect(signedIn.status).toBe(200);
    });

    it('does not reveal whether an account exists', async () => {
      const response = await request(server)
        .post('/api/v1/auth/password/forgot')
        .send({ identifier: 'nobody@school.ng' });
      expect(response.status).toBe(202);
      expect(response.body.challenge_id).toBeTruthy();
      expect(notifier.messages).toHaveLength(0);
    });
  });

  describe('two-step verification', () => {
    it('is available to admins only', async () => {
      await seedUser(users, passwords, { email: 'student@school.ng', role: 'student' });
      const agent = request.agent(server);
      await login(agent, 'student@school.ng', PASSWORD);
      const csrf = (await agent.get('/api/v1/auth/me')).body.csrf_token as string;

      const response = await agent.post('/api/v1/auth/2fa/setup').set('X-CSRF-Token', csrf);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
    });

    it('sets up, enables, requires and accepts a code, and honours recovery codes', async () => {
      await seedUser(users, passwords, { email: 'admin@school.ng', role: 'school_admin' });
      const agent = request.agent(server);
      const loginResponse = await login(agent, 'admin@school.ng', PASSWORD);
      const csrf = loginResponse.body.csrf_token as string;

      const setup = await agent.post('/api/v1/auth/2fa/setup').set('X-CSRF-Token', csrf);
      expect(setup.status).toBe(200);
      expect(setup.body.otpauth_uri).toContain('otpauth://totp/');

      const code = await generate({ secret: setup.body.secret as string });
      const enabled = await agent
        .post('/api/v1/auth/2fa/enable')
        .set('X-CSRF-Token', csrf)
        .send({ code });
      expect(enabled.status).toBe(200);
      const recoveryCodes = enabled.body.recovery_codes as string[];
      expect(recoveryCodes).toHaveLength(10);

      const noCode = await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@school.ng', password: PASSWORD });
      expect(noCode.status).toBe(401);
      expect(noCode.body.code).toBe('TOTP_REQUIRED');

      const withCode = await request(server)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'admin@school.ng',
          password: PASSWORD,
          totp: await generate({ secret: setup.body.secret as string }),
        });
      expect(withCode.status).toBe(200);

      const withRecovery = await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@school.ng', password: PASSWORD, totp: recoveryCodes[0] });
      expect(withRecovery.status).toBe(200);
    });
  });
});
