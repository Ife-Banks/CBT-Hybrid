import { Inject, Injectable } from '@nestjs/common';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { sha256Hex } from '@cbt/exam-core';
import { uuidv7 } from '@cbt/shared-types';
import type {
  LoginRequest,
  LoginResponse,
  MeResponse,
  PasswordChangeRequest,
  PasswordForgotRequest,
  PasswordForgotResponse,
  PasswordResetRequest,
  SessionsResponse,
  TotpDisableRequest,
  TotpEnableResponse,
  TotpSetupResponse,
} from '@cbt/shared-types';
import { ConfigService } from '../../common/config/config.service';
import { PasswordService } from './password.service';
import { IssuedSession, SessionService } from './session.service';
import { TotpService } from './totp.service';
import { AuditService } from './audit/audit.service';
import { ClockService } from './clock.service';
import { ADMIN_ROLES, OTP_CODE_DIGITS } from './auth.constants';
import { RequestContext, SessionRecord, UserRecord } from './domain/types';
import { toSessionSummary, toSessionUser } from './domain/mappers';
import { USER_REPOSITORY, UserRepository } from './repositories/user.repository';
import { OTP_CHALLENGE_REPOSITORY, OtpChallengeRepository } from './repositories/otp.repository';
import { NOTIFIER, Notifier } from './notifier';
import {
  accountLocked,
  forbidden,
  invalidCredentials,
  notFound,
  otpInvalid,
  otpLocked,
  totpInvalid,
  totpRequired,
  validationFailed,
} from './http/errors';

/** Result of a successful sign-in: the response body plus the issued session. */
export interface LoginResult {
  response: LoginResponse;
  issued: IssuedSession;
}

/**
 * Sign-in, sessions, password management and two-step verification
 * (API and Sync Specification section 3; CBT-04 sections 3.6-3.7).
 *
 * All state goes through repository ports, so the Drizzle-backed tables arriving
 * in Phase 3 drop in without touching this logic.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly totp: TotpService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(OTP_CHALLENGE_REPOSITORY) private readonly challenges: OtpChallengeRepository,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  // --- Sign-in -------------------------------------------------------------

  async login(input: LoginRequest, context: RequestContext): Promise<LoginResult> {
    const now = this.clock.now();
    const user = await this.users.findByIdentifier(input.identifier);

    if (!user || user.status !== 'active') {
      // Equalise timing with the known-account path.
      await this.passwords.verifyDummy(input.password);
      this.auditLogin(
        'failure',
        user?.id ?? null,
        user?.schoolId ?? null,
        context,
        'unknown_account',
      );
      throw invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
      this.auditLogin('failure', user.id, user.schoolId, context, 'locked');
      throw accountLocked(user.lockedUntil);
    }

    if (!(await this.passwords.verify(user.passwordHash, input.password))) {
      await this.registerFailedAttempt(user);
      if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
        this.auditLogin('failure', user.id, user.schoolId, context, 'locked');
        throw accountLocked(user.lockedUntil);
      }
      this.auditLogin('failure', user.id, user.schoolId, context, 'bad_password');
      throw invalidCredentials();
    }

    if (user.totpEnabled) {
      if (!input.totp) {
        this.auditLogin('failure', user.id, user.schoolId, context, 'totp_required');
        throw totpRequired();
      }
      if (!(await this.totp.verify(user, input.totp))) {
        await this.registerFailedAttempt(user);
        if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
          this.auditLogin('failure', user.id, user.schoolId, context, 'locked');
          throw accountLocked(user.lockedUntil);
        }
        this.auditLogin('failure', user.id, user.schoolId, context, 'bad_totp');
        throw totpInvalid();
      }
    }

    await this.clearFailedAttempts(user);
    const issued = await this.sessions.create(user, context);
    this.auditLogin('success', user.id, user.schoolId, context);

    return {
      response: { user: toSessionUser(user), csrf_token: issued.csrfToken },
      issued,
    };
  }

  // --- Sessions ------------------------------------------------------------

  async logout(session: SessionRecord, context: RequestContext): Promise<void> {
    await this.sessions.revoke(session);
    this.audit.record({
      action: 'auth.logout',
      outcome: 'success',
      actorUserId: session.userId,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });
  }

  me(user: UserRecord, session: SessionRecord): MeResponse {
    return {
      user: toSessionUser(user),
      // Licence enforcement (read-only after expiry, US-1.3) arrives with the
      // licence module; until then a school-scoped account is reported active.
      licence: { state: user.schoolId ? 'active' : 'none' },
      csrf_token: this.sessions.csrfTokenFor(session.id),
    };
  }

  async listSessions(user: UserRecord, currentSessionId: string): Promise<SessionsResponse> {
    const sessions = await this.sessions.listActiveForUser(user.id);
    return {
      sessions: sessions
        .map((session) => toSessionSummary(session, currentSessionId))
        .sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at)),
    };
  }

  async revokeSession(user: UserRecord, sessionId: string, context: RequestContext): Promise<void> {
    const session = await this.sessions.findById(sessionId);
    if (!session || session.userId !== user.id) {
      throw notFound('Session not found');
    }
    await this.sessions.revoke(session);
    this.audit.record({
      action: 'auth.session.revoked',
      outcome: 'success',
      actorUserId: user.id,
      schoolId: user.schoolId,
      targetType: 'session',
      targetId: sessionId,
      ip: context.ip,
      requestId: context.requestId,
    });
  }

  // --- Passwords -----------------------------------------------------------

  async changePassword(
    user: UserRecord,
    input: PasswordChangeRequest,
    currentSessionId: string,
    context: RequestContext,
  ): Promise<{ revoked: number }> {
    if (!(await this.passwords.verify(user.passwordHash, input.current_password))) {
      this.audit.record({
        action: 'auth.password.change',
        outcome: 'failure',
        actorUserId: user.id,
        ip: context.ip,
        requestId: context.requestId,
        detail: { reason: 'bad_current_password' },
      });
      throw invalidCredentials();
    }

    this.assertPasswordPolicy(input.new_password, user);

    user.passwordHash = await this.passwords.hash(input.new_password);
    user.passwordChangedAt = this.clock.now();
    user.mustChangePassword = false;
    user.updatedAt = this.clock.now();
    await this.users.save(user);

    // Revokes every other session (API spec section 3.2), keeping this one.
    const revoked = await this.sessions.revokeAllForUser(user.id, currentSessionId);
    this.audit.record({
      action: 'auth.password.change',
      outcome: 'success',
      actorUserId: user.id,
      schoolId: user.schoolId,
      ip: context.ip,
      requestId: context.requestId,
      detail: { revoked_sessions: revoked },
    });
    return { revoked };
  }

  /**
   * Start a password reset. Always returns a challenge id, whether or not the
   * account exists, so the response cannot be used to enumerate accounts.
   */
  async forgotPassword(
    input: PasswordForgotRequest,
    context: RequestContext,
  ): Promise<PasswordForgotResponse> {
    const now = this.clock.now();
    const user = await this.users.findByIdentifier(input.identifier);
    const contact = user ? (user.email ?? user.phone) : null;

    if (!user || user.status !== 'active' || !contact) {
      this.audit.record({
        action: 'auth.password.forgot',
        outcome: 'failure',
        requestId: context.requestId,
        detail: { reason: 'unknown_account' },
      });
      return { challenge_id: uuidv7() };
    }

    // Throttle resends: within the cooldown, reissue the existing challenge id.
    const existing = await this.challenges.findLatest(user.id, 'password_reset');
    if (
      existing &&
      now.getTime() - existing.createdAt.getTime() < this.config.auth.otpResendSeconds * 1000
    ) {
      return { challenge_id: existing.id };
    }

    const code = generateNumericCode(OTP_CODE_DIGITS);
    const challengeId = uuidv7();
    await this.challenges.create({
      id: challengeId,
      userId: user.id,
      purpose: 'password_reset',
      sentTo: contact,
      codeHash: sha256Hex(code),
      attempts: 0,
      maxAttempts: this.config.auth.otpMaxAttempts,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.config.auth.otpTtlSeconds * 1000),
      consumedAt: null,
    });
    await this.notifier.sendPasswordReset({ to: contact, fullName: user.fullName, code });

    this.audit.record({
      action: 'auth.password.forgot',
      outcome: 'success',
      actorUserId: user.id,
      schoolId: user.schoolId,
      ip: context.ip,
      requestId: context.requestId,
    });
    return { challenge_id: challengeId };
  }

  /** Complete a password reset; revokes every session for the account. */
  async resetPassword(input: PasswordResetRequest, context: RequestContext): Promise<void> {
    const challenge = await this.challenges.findById(input.challenge_id);
    const now = this.clock.now();

    if (
      !challenge ||
      challenge.purpose !== 'password_reset' ||
      challenge.consumedAt !== null ||
      challenge.expiresAt.getTime() <= now.getTime()
    ) {
      throw otpInvalid(this.config.auth.otpMaxAttempts);
    }

    if (challenge.attempts >= this.config.auth.otpMaxAttempts) {
      throw otpLocked();
    }

    if (!constantTimeEqualHex(challenge.codeHash, sha256Hex(input.code))) {
      challenge.attempts += 1;
      await this.challenges.save(challenge);
      const attemptsLeft = this.config.auth.otpMaxAttempts - challenge.attempts;
      this.audit.record({
        action: 'auth.password.reset',
        outcome: 'failure',
        actorUserId: challenge.userId,
        requestId: context.requestId,
        detail: { reason: 'bad_code', attempts_left: attemptsLeft },
      });
      if (attemptsLeft <= 0) throw otpLocked();
      throw otpInvalid(attemptsLeft);
    }

    const user = await this.users.findById(challenge.userId);
    if (!user || user.status !== 'active') {
      throw otpInvalid(this.config.auth.otpMaxAttempts);
    }

    this.assertPasswordPolicy(input.new_password, user);

    challenge.consumedAt = now;
    await this.challenges.save(challenge);

    user.passwordHash = await this.passwords.hash(input.new_password);
    user.passwordChangedAt = now;
    user.mustChangePassword = false;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.updatedAt = now;
    await this.users.save(user);

    const revoked = await this.sessions.revokeAllForUser(user.id);
    this.audit.record({
      action: 'auth.password.reset',
      outcome: 'success',
      actorUserId: user.id,
      schoolId: user.schoolId,
      ip: context.ip,
      requestId: context.requestId,
      detail: { revoked_sessions: revoked },
    });
  }

  // --- Two-step verification ----------------------------------------------

  async setupTotp(user: UserRecord, context: RequestContext): Promise<TotpSetupResponse> {
    this.assertAdmin(user);
    const { secret, otpauthUri } = await this.totp.beginSetup(user);
    this.audit.record({
      action: 'auth.2fa.setup',
      outcome: 'success',
      actorUserId: user.id,
      schoolId: user.schoolId,
      requestId: context.requestId,
    });
    return { otpauth_uri: otpauthUri, secret };
  }

  async enableTotp(
    user: UserRecord,
    code: string,
    context: RequestContext,
  ): Promise<TotpEnableResponse> {
    this.assertAdmin(user);
    const recoveryCodes = await this.totp.enable(user, code);
    this.audit.record({
      action: 'auth.2fa.enable',
      outcome: 'success',
      actorUserId: user.id,
      schoolId: user.schoolId,
      requestId: context.requestId,
    });
    return { recovery_codes: recoveryCodes };
  }

  async disableTotp(
    user: UserRecord,
    input: TotpDisableRequest,
    context: RequestContext,
  ): Promise<void> {
    this.assertAdmin(user);
    // The platform owner cannot remove their own second factor (API spec 3.2).
    if (user.role === 'platform_owner') {
      throw forbidden('The platform owner cannot disable two-step verification');
    }
    if (!(await this.passwords.verify(user.passwordHash, input.password))) {
      throw invalidCredentials();
    }
    if (!(await this.totp.verify(user, input.code))) {
      throw totpInvalid();
    }
    await this.totp.disable(user);
    this.audit.record({
      action: 'auth.2fa.disable',
      outcome: 'success',
      actorUserId: user.id,
      schoolId: user.schoolId,
      requestId: context.requestId,
    });
  }

  // --- Helpers -------------------------------------------------------------

  private assertAdmin(user: UserRecord): void {
    if (!ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])) {
      throw forbidden('Only administrators can manage two-step verification');
    }
  }

  private assertPasswordPolicy(password: string, user: UserRecord): void {
    const violations = this.passwords.validate(password, { email: user.email, phone: user.phone });
    if (violations.length > 0) throw validationFailed(violations);
  }

  private async registerFailedAttempt(user: UserRecord): Promise<void> {
    const now = this.clock.now();
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= this.config.auth.lockoutThreshold) {
      user.lockedUntil = new Date(now.getTime() + this.config.auth.lockoutSeconds * 1000);
    }
    user.updatedAt = now;
    await this.users.save(user);
  }

  private async clearFailedAttempts(user: UserRecord): Promise<void> {
    if (user.failedLoginAttempts === 0 && user.lockedUntil === null) return;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.updatedAt = this.clock.now();
    await this.users.save(user);
  }

  private auditLogin(
    outcome: 'success' | 'failure',
    actorUserId: string | null,
    schoolId: string | null,
    context: RequestContext,
    reason?: string,
  ): void {
    this.audit.record({
      action: 'auth.login',
      outcome,
      actorUserId,
      schoolId,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      ...(reason ? { detail: { reason } } : {}),
    });
  }
}

/** Random decimal code of the given length, zero-padded. */
export function generateNumericCode(digits: number): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, '0');
}

/** Constant-time comparison of two hex digests. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
