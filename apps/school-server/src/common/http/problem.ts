import { HttpException } from '@nestjs/common';
import { ERROR_CATALOGUE, type ErrorCode } from '@cbt/shared-types';

/**
 * Build an `HttpException` that carries a catalogue error code. The global
 * exception filter turns it into `application/problem+json` with the right HTTP
 * status and title (API spec sections 1.4 and 2).
 */
export function problem(code: ErrorCode, detail?: string): HttpException {
  const entry = ERROR_CATALOGUE[code];
  return new HttpException({ code, message: detail ?? entry.title }, entry.status);
}
