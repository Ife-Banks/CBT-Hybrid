/**
 * Constants for the authentication module. Cookie names and the CSRF header are
 * fixed by API and Sync Specification section 1.3.
 */

/** Session cookie: HttpOnly, Secure, SameSite=Lax, holds the random token. */
export const SESSION_COOKIE = 'cbt_session';

/** CSRF cookie: read by JavaScript, double-submitted in a header. */
export const CSRF_COOKIE = 'cbt_csrf';

/** Header that must echo the CSRF cookie on unsafe methods. */
export const CSRF_HEADER = 'x-csrf-token';

/** Issuer shown in the authenticator app. */
export const TOTP_ISSUER = 'CBT School';

/** Number of single-use recovery codes issued when 2FA is enabled. */
export const RECOVERY_CODE_COUNT = 10;

/** Digits in one-time codes (API spec section 20: 6). */
export const OTP_CODE_DIGITS = 6;

/** Roles allowed to manage two-step verification (API spec section 3.2). */
export const ADMIN_ROLES = ['platform_owner', 'school_admin'] as const;

/** Methods that require a valid CSRF token when a session is present. */
export const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
