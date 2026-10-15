import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import {
  ERROR_CATALOGUE,
  PROBLEM_JSON_CONTENT_TYPE,
  isErrorCode,
  type ErrorCode,
  type FieldError,
  type ProblemDetails,
} from '@cbt/shared-types';
import { HttpRequest, HttpResponse } from '../http/http-types';
import { LoggerService } from '../../shared/logger/logger.service';

/** Fallback error code for each HTTP status. */
const STATUS_TO_CODE: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'AUTH_REQUIRED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.GONE]: 'INVITE_EXPIRED',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
  [HttpStatus.LOCKED]: 'ACCOUNT_LOCKED',
  426: 'SYNC_PROTOCOL_UNSUPPORTED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL',
};

/**
 * Turns every thrown error into an `application/problem+json` response
 * (API spec section 1.4). Internal errors never leak their message or stack to
 * the client; they are logged with the request id instead.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponse>();
    const request = ctx.getRequest<HttpRequest>();
    const requestId = request.requestId ?? 'unknown';

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = 'INTERNAL';
    let detail: string = ERROR_CATALOGUE.INTERNAL.title;
    let errors: FieldError[] | undefined;
    let extra: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_TO_CODE[status] ?? 'INTERNAL';
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        detail = payload;
      } else if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        if (typeof record.code === 'string' && isErrorCode(record.code)) {
          code = record.code;
        }
        const message = record.message;
        if (Array.isArray(message)) {
          detail = 'Validation failed';
          errors = message.map((entry) => ({
            field: '',
            code: 'INVALID',
            message: String(entry),
          }));
        } else if (typeof message === 'string') {
          detail = message;
        } else if (typeof record.detail === 'string') {
          detail = record.detail;
        }

        const fromRecord = toFieldErrors(record.errors);
        if (fromRecord) errors = fromRecord;
        extra = extraMembers(record);
      }
    } else {
      this.logger.error(
        `Unhandled exception for ${request.method} ${request.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
        'HttpExceptionFilter',
      );
    }

    const body = {
      type: `https://docs.cbt.example/errors/${code.toLowerCase().replace(/_/g, '-')}`,
      title: isErrorCode(code) ? ERROR_CATALOGUE[code].title : 'Error',
      status,
      code,
      detail,
      request_id: requestId,
      ...(errors ? { errors } : {}),
      ...(extra ?? {}),
    } as ProblemDetails;

    response.status(status);
    response.setHeader('content-type', PROBLEM_JSON_CONTENT_TYPE);
    response.json(body);
  }
}

/** Members that belong on the problem body rather than nested in the exception. */
const RESERVED_MEMBERS = new Set([
  'code',
  'message',
  'detail',
  'errors',
  'type',
  'title',
  'status',
  'request_id',
]);

/**
 * Copy any additional exception members (for example `locked_until` on
 * `ACCOUNT_LOCKED`, `attempts_left` on `OTP_INVALID`) straight onto the problem
 * body, which is allowed by RFC 9457.
 */
function extraMembers(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (RESERVED_MEMBERS.has(key)) continue;
    extra[key] = value;
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
}

/** Accept a well-formed `errors[]` array; ignore anything else. */
function toFieldErrors(value: unknown): FieldError[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: FieldError[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return undefined;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.field !== 'string' ||
      typeof record.code !== 'string' ||
      typeof record.message !== 'string'
    ) {
      return undefined;
    }
    result.push({ field: record.field, code: record.code, message: record.message });
  }
  return result;
}
