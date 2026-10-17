import type { SessionSummary, SessionUser } from '@cbt/shared-types';
import type { SessionRecord, UserRecord, SchoolRef, OtpChallengeRecord } from './types';
import type { User as DbUser, School as DbSchool, Session as DbSession, OtpChallenge as DbOtpChallenge } from '@cbt/shared-types';

/** Map a stored user to the shape returned by login and `GET /auth/me`. */
export function toSessionUser(user: UserRecord): SessionUser {
  return {
    id: user.id,
    role: user.role,
    full_name: user.fullName,
    ...(user.school ? { school: { ...user.school } } : {}),
    must_change_password: user.mustChangePassword,
  };
}

/** Map a Drizzle school row to a SchoolRef. */
function toSchoolRef(dbSchool: DbSchool): SchoolRef {
  return {
    id: dbSchool.id,
    code: dbSchool.code,
    name: dbSchool.name,
  };
}

/** Map a Drizzle user row to a UserRecord. */
export function toUserRecord(dbUser: DbUser, dbSchool?: DbSchool | null): UserRecord {
  const school: SchoolRef | null = dbSchool ? toSchoolRef(dbSchool) : null;

  return {
    id: dbUser.id,
    role: dbUser.role,
    fullName: dbUser.fullName,
    email: dbUser.email || null,
    phone: dbUser.phoneE164 || null,
    schoolId: dbUser.schoolId,
    school,
    passwordHash: dbUser.passwordHash,
    mustChangePassword: dbUser.mustChangePassword || false,
    status: dbUser.status === 'suspended' ? 'suspended' : 'active',
    totpEnabled: dbUser.totpSecret !== null,
    totpSecret: dbUser.totpSecret,
    recoveryCodeHashes: dbUser.recoveryCodeHashes || [],
    failedLoginAttempts: dbUser.failedLoginAttempts,
    lockedUntil: dbUser.lockedUntil,
    lastLoginAt: dbUser.lastLoginAt,
    passwordChangedAt: dbUser.passwordChangedAt,
    preferences: dbUser.preferences as Record<string, unknown> | undefined,
    createdAt: dbUser.createdAt,
    updatedAt: dbUser.updatedAt,
  };
}

/** Map a Drizzle session row to a SessionRecord. */
export function toSessionRecord(dbSession: DbSession): SessionRecord {
  return {
    id: dbSession.id,
    userId: dbSession.userId,
    tokenHash: dbSession.tokenHash,
    ip: dbSession.ipAddress || '',
    userAgent: dbSession.userAgent || '',
    deviceName: dbSession.deviceName || undefined,
    createdAt: dbSession.createdAt,
    lastSeenAt: dbSession.lastSeenAt || dbSession.createdAt,
    expiresAt: dbSession.expiresAt,
    sliding: dbSession.sliding || false,
    revokedAt: dbSession.revokedAt,
  };
}

/** Map a Drizzle OTP challenge row to an OtpChallengeRecord. */
export function toOtpChallengeRecord(dbOtp: DbOtpChallenge): OtpChallengeRecord {
  return {
    id: dbOtp.id,
    userId: dbOtp.userId || '',
    purpose: dbOtp.purpose as 'password_reset' | 'guardian_email',
    sentTo: dbOtp.sentTo,
    codeHash: dbOtp.codeHash,
    attempts: dbOtp.attempts,
    maxAttempts: dbOtp.maxAttempts,
    createdAt: dbOtp.createdAt,
    expiresAt: dbOtp.expiresAt,
    consumedAt: dbOtp.consumedAt,
  };
}

/** Map a stored session to a row of `GET /auth/sessions`. */
export function toSessionSummary(session: SessionRecord, currentSessionId: string): SessionSummary {
  return {
    id: session.id,
    device: describeUserAgent(session.userAgent),
    ip: session.ip,
    created_at: session.createdAt.toISOString(),
    last_seen_at: session.lastSeenAt.toISOString(),
    current: session.id === currentSessionId,
  };
}

/**
 * Best-effort, dependency-free device label from a user agent. Good enough for
 * the "sign out another device" list; a full parser can replace it later.
 */
export function describeUserAgent(userAgent: string): string {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent.toLowerCase();

  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('opr/') || ua.includes('opera')
      ? 'Opera'
      : ua.includes('chrome')
        ? 'Chrome'
        : ua.includes('firefox')
          ? 'Firefox'
          : ua.includes('safari')
            ? 'Safari'
            : 'Browser';

  const platform = ua.includes('windows')
    ? 'Windows'
    : ua.includes('android')
      ? 'Android'
      : ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')
        ? 'iOS'
        : ua.includes('mac os')
          ? 'macOS'
          : ua.includes('linux')
            ? 'Linux'
            : 'Unknown OS';

  return `${browser} on ${platform}`;
}
