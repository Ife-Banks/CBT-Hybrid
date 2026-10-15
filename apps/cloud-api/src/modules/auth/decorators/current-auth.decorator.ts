import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthRequest } from '../http/request';
import type { AuthContext } from '../domain/types';

/**
 * Injects the authenticated principal (`{ user, session }`) into a handler. Only
 * valid on routes protected by the authentication guard.
 */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!request.auth) {
      throw new Error('CurrentAuth used on a route without the authentication guard');
    }
    return request.auth;
  },
);
