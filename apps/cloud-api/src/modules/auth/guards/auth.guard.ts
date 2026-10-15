import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { AuthRequest } from '../http/request';
import { authRequired } from '../http/errors';
import { ensureCookies } from '../http/cookies';
import { SESSION_COOKIE } from '../auth.constants';
import { SessionService } from '../session.service';
import { USER_REPOSITORY, UserRepository } from '../repositories/user.repository';
import { AuditService } from '../audit/audit.service';

/**
 * Global authentication guard. Parses cookies, resolves the session cookie to a
 * live session, loads the user, refreshes the session's `last_seen_at`, and
 * attaches `{ user, session }` to the request. Public routes skip all of it.
 *
 * Runs first in the guard chain so the CSRF and abilities guards can rely on
 * `request.auth`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const cookies = ensureCookies(request);

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const token = cookies[SESSION_COOKIE];
    if (!token) throw authRequired();

    const session = await this.sessions.findByToken(token);
    if (!session) throw authRequired();

    const user = await this.users.findById(session.userId);
    if (!user || user.status !== 'active') {
      await this.sessions.revoke(session);
      this.audit.record({
        action: 'auth.session.rejected',
        outcome: 'failure',
        actorUserId: session.userId,
        requestId: request.requestId,
        detail: { reason: user ? 'suspended' : 'missing_user' },
      });
      throw authRequired();
    }

    await this.sessions.touch(session);

    request.auth = { user, session };
    return true;
  }
}
