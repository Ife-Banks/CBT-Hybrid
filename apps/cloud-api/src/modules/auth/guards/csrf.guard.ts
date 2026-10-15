import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { CSRF_COOKIE, CSRF_HEADER, UNSAFE_METHODS } from '../auth.constants';
import { ensureCookies } from '../http/cookies';
import { AuthRequest } from '../http/request';
import { forbidden } from '../http/errors';
import { SessionService } from '../session.service';
import { AuditService } from '../audit/audit.service';

/**
 * Double-submit CSRF guard (API spec section 1.3). On an unsafe method with a
 * session present, the `X-CSRF-Token` header must equal the `cbt_csrf` cookie and
 * must match the token derived from the session id.
 *
 * Public unsafe routes (login, password forgot/reset) carry no session, so there
 * is nothing to protect and they are skipped.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    ensureCookies(request);

    if (!UNSAFE_METHODS.has(request.method)) return true;
    if (!request.auth) return true;

    const header = request.headers[CSRF_HEADER];
    const submitted =
      typeof header === 'string' ? header : Array.isArray(header) ? header[0] : undefined;
    const cookieToken = request.cookies?.[CSRF_COOKIE];

    const ok =
      Boolean(submitted) &&
      Boolean(cookieToken) &&
      submitted === cookieToken &&
      this.sessions.csrfMatches(request.auth.session.id, submitted);

    if (!ok) {
      this.audit.record({
        action: 'auth.csrf.rejected',
        outcome: 'failure',
        actorUserId: request.auth.user.id,
        ip: request.ip,
        requestId: request.requestId,
      });
      throw forbidden('Invalid CSRF token');
    }

    return true;
  }
}
