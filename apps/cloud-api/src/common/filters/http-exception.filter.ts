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
      }
    } else {
      this.logger.error(
        `Unhandled exception for ${request.method} ${request.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
        'HttpExceptionFilter',
      );
    }

    const body: ProblemDetails = {
      type: `https://docs.cbt.example/errors/${code.toLowerCase().replace(/_/g, '-')}`,
      title: isErrorCode(code) ? ERROR_CATALOGUE[code].title : 'Error',
      status,
      code,
      detail,
      request_id: requestId,
      ...(errors ? { errors } : {}),
    };

    response.status(status);
    response.setHeader('content-type', PROBLEM_JSON_CONTENT_TYPE);
    response.json(body);
  }
}
