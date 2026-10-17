import { ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '../modules/auth/domain/types';

/**
 * The school every result route is scoped to. A platform owner has no school,
 * so result and report routes require a school user.
 */
export function requireSchool(auth: AuthContext): string {
  if (!auth.user.schoolId) {
    throw new ForbiddenException({
      code: 'SCHOOL_REQUIRED',
      message: 'This action requires a school user',
    });
  }
  return auth.user.schoolId;
}
