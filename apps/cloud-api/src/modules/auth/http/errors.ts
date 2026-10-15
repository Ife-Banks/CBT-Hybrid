import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { FieldError } from '@cbt/shared-types';

/**
 * Exception factories that carry the stable `code` from the error catalogue
 * (API spec section 2). The global filter renders them as
 * `application/problem+json`, preserving any extra members (for example
 * `locked_until` on `ACCOUNT_LOCKED`).
 */

export function authRequired(): HttpException {
  return new UnauthorizedException({ code: 'AUTH_REQUIRED', detail: 'Authentication required' });
}

export function invalidCredentials(): HttpException {
  return new UnauthorizedException({ code: 'INVALID_CREDENTIALS', detail: 'Invalid credentials' });
}

export function totpRequired(): HttpException {
  return new UnauthorizedException({
    code: 'TOTP_REQUIRED',
    detail: 'Authenticator code required',
  });
}

export function totpInvalid(): HttpException {
  return new UnauthorizedException({ code: 'TOTP_INVALID', detail: 'Invalid authenticator code' });
}

export function forbidden(detail = 'Forbidden'): HttpException {
  return new ForbiddenException({ code: 'FORBIDDEN', detail });
}

export function notFound(detail = 'Not found'): HttpException {
  return new NotFoundException({ code: 'NOT_FOUND', detail });
}

/** Account locked: includes `locked_until` (API spec section 2). */
export function accountLocked(lockedUntil: Date): HttpException {
  return new HttpException(
    {
      code: 'ACCOUNT_LOCKED',
      detail: 'Too many failed sign-ins',
      locked_until: lockedUntil.toISOString(),
    },
    HttpStatus.LOCKED,
  );
}

/** Wrong one-time code: includes `attempts_left` (API spec section 2). */
export function otpInvalid(attemptsLeft: number): HttpException {
  return new BadRequestException({
    code: 'OTP_INVALID',
    detail: 'Invalid one-time code',
    attempts_left: attemptsLeft,
  });
}

export function otpLocked(): HttpException {
  return new HttpException(
    { code: 'OTP_LOCKED', detail: 'Too many wrong codes, request a new one' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

export function validationFailed(errors: FieldError[]): HttpException {
  return new UnprocessableEntityException({
    code: 'VALIDATION_FAILED',
    detail: 'Validation failed',
    errors,
  });
}
