import type { SessionSummary, SessionUser } from '@cbt/shared-types';
import type { SessionRecord, UserRecord } from './types';

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
