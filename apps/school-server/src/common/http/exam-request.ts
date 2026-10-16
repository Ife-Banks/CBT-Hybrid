import type { HttpRequest } from './http-types';

/** Interface with the extra properties the exam controller reads. */
export interface ExamHttpRequest extends HttpRequest {
  ip?: string;
  /** Parsed request body (Express-style). */
  body?: unknown;
  socket?: { remoteAddress?: string };
  /** Set by the session-token guard. */
  examSession?: unknown;
}

/** Best-effort client address, used for seat and session tracking. */
export function clientIp(request: ExamHttpRequest): string | null {
  return request.ip ?? request.socket?.remoteAddress ?? null;
}

/** The `Bearer` credential from the Authorization header, if present. */
export function bearerToken(request: ExamHttpRequest): string | null {
  const header = request.headers['authorization'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const parts = value.split(' ');
  if (parts.length !== 2) return null;
  const [scheme, token] = parts;
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}
