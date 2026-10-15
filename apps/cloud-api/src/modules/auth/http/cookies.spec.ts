import { describe, expect, it } from 'vitest';
import {
  clearAuthCookies,
  csrfCookie,
  ensureCookies,
  parseCookieHeader,
  serializeCookie,
  sessionCookie,
} from './cookies';
import type { HttpRequest } from '../../../common/http/http-types';

function request(cookie?: string): HttpRequest {
  return {
    method: 'GET',
    originalUrl: '/',
    url: '/',
    headers: cookie ? { cookie } : {},
  };
}

describe('cookie parsing', () => {
  it('parses a multi-cookie header', () => {
    expect(parseCookieHeader('cbt_session=abc; cbt_csrf=def')).toEqual({
      cbt_session: 'abc',
      cbt_csrf: 'def',
    });
  });

  it('ignores malformed segments and strips quotes', () => {
    expect(parseCookieHeader('broken; a="b" ; empty=')).toEqual({ a: 'b', empty: '' });
  });

  it('returns an empty map for a missing header', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
  });

  it('attaches cookies to the request only once', () => {
    const req = request('cbt_session=abc');
    expect(ensureCookies(req)).toEqual({ cbt_session: 'abc' });
    // Mutating the header afterwards has no effect: parsing is memoised.
    req.headers.cookie = 'cbt_session=zzz';
    expect(ensureCookies(req)).toEqual({ cbt_session: 'abc' });
  });
});

describe('cookie serialisation', () => {
  it('sets HttpOnly and SameSite on the session cookie', () => {
    const value = sessionCookie('tok', 600, true);
    expect(value).toContain('cbt_session=tok');
    expect(value).toContain('HttpOnly');
    expect(value).toContain('Secure');
    expect(value).toContain('SameSite=Lax');
    expect(value).toContain('Max-Age=600');
  });

  it('leaves the CSRF cookie readable by JavaScript', () => {
    const value = csrfCookie('c', 600, false);
    expect(value).toContain('cbt_csrf=c');
    expect(value).not.toContain('HttpOnly');
    expect(value).not.toContain('Secure');
  });

  it('omits empty optional attributes', () => {
    expect(serializeCookie('x', 'y')).toBe('x=y; Path=/');
  });

  it('clears both cookies by expiring them', () => {
    const values = clearAuthCookies(false);
    expect(values).toHaveLength(2);
    expect(values.every((value) => value.includes('Max-Age=0'))).toBe(true);
  });
});
