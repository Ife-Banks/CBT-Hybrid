import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { uuidv7 } from '@cbt/shared-types';
import { type Observable, tap } from 'rxjs';
import { HttpRequest, HttpResponse } from '../http/http-types';
import { LoggerService } from '../../shared/logger/logger.service';

/**
 * Attaches a correlation id to every request (reusing an inbound
 * `x-request-id` when present) and logs one line per completed request with its
 * duration. The id is echoed in the `x-request-id` response header and included
 * in error bodies.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<HttpResponse>();

    const inbound = request.headers['x-request-id'];
    const requestId =
      request.requestId ??
      (typeof inbound === 'string' && inbound.length > 0 ? inbound : undefined) ??
      uuidv7();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);

    const startedAt = Date.now();
    const { method, originalUrl } = request;

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `${method} ${originalUrl} ${response.statusCode} ${Date.now() - startedAt}ms`,
            'HTTP',
          );
        },
        error: (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `${method} ${originalUrl} failed after ${Date.now() - startedAt}ms: ${message}`,
            'HTTP',
          );
        },
      }),
    );
  }
}
