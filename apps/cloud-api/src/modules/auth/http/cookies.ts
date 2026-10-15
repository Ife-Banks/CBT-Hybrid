/**
 * Minimal cookie parsing and serialisation. We avoid pulling in Express types or
 * a cookie middleware: the only cookies we read are our own (`cbt_session`,
 * `cbt_csrf`), whose values are base64url / hex and never quoted.
 */

import { HttpRequest } from '../../../common/http/http-types';
import { CSRF_COOKIE, SESSION_COOKIE } from '../auth.constants';

/** Parse a `Cookie:` header into a name/value map. Later duplicates win. */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name.length === 0) continue;
    const rawValue = part.slice(separator + 1).trim();
    // Values are ours and unquoted; strip a defensive pair of quotes anyway.
    const value =
      rawValue.length >= 2 && rawValue.startsWith('"') && rawValue.endsWith('"')
        ? rawValue.slice(1, -1)
        : rawValue;
    out[name] = value;
  }

  return out;
}

/**
 * Attach parsed cookies to the request, once. Call before reading any cookie so
 * requests work whether or not a cookie middleware is installed.
 */
export function ensureCookies(request: HttpRequest): Record<string, string> {
  if (!request.cookies) {
    const header = request.headers.cookie;
    request.cookies = parseCookieHeader(typeof header === 'string' ? header : undefined);
  }
  return request.cookies;
}

export interface CookieOptions {
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  path?: string;
}

/** Serialise a single `Set-Cookie` value. */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${value}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.maxAge !== undefined)
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

/** The `Set-Cookie` value for the session cookie (HttpOnly, SameSite=Lax). */
export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return serializeCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    maxAge: maxAgeSeconds,
  });
}

/** The `Set-Cookie` value for the CSRF cookie (readable by JavaScript). */
export function csrfCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return serializeCookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure,
    sameSite: 'Lax',
    maxAge: maxAgeSeconds,
  });
}

/** Expire both auth cookies (on logout and after a password reset). */
export function clearAuthCookies(secure: boolean): string[] {
  const options: CookieOptions = { maxAge: 0, secure, sameSite: 'Lax' };
  return [
    serializeCookie(SESSION_COOKIE, '', { ...options, httpOnly: true }),
    serializeCookie(CSRF_COOKIE, '', { ...options, httpOnly: false }),
  ];
}
