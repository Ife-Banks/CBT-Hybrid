import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { sha256Hex } from '@cbt/exam-core';
import { problem } from '../../../common/http/problem';
import { bearerToken, type ExamHttpRequest } from '../../../common/http/exam-request';
import { SESSION_REPOSITORY, type SessionRepository } from '../repositories/session.repository';
import type { SessionRecord } from '../domain/types';

/** Request shape once the guard has run. */
export interface SessionHttpRequest extends ExamHttpRequest {
  examSession?: SessionRecord;
}

/**
 * Resolves the `Authorization: Bearer <session_token>` token to its session and
 * attaches it to the request. Only the SHA-256 of the token is stored, so a
 * database leak does not expose live tokens (API spec 16.1).
 */
@Injectable()
export class SessionTokenGuard implements CanActivate {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: SessionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionHttpRequest>();
    const token = bearerToken(request);
    if (!token) {
      throw problem('AUTH_REQUIRED', 'A session token is required');
    }

    const session = await this.sessionRepo.findByTokenHash(sha256Hex(token));
    if (!session) {
      throw problem('AUTH_REQUIRED', 'Session token is not valid');
    }

    request.examSession = session;
    return true;
  }
}
