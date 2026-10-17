import {
  ConflictException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { IdempotencyService } from './idempotency.service';

interface IdempotentRequest {
  method: string;
  path: string;
  route?: { path?: string };
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface IdempotentResponse {
  statusCode: number;
  status(code: number): IdempotentResponse;
}

/**
 * Applies the `Idempotency-Key` contract (API spec 1.6) to a route. Repeat with
 * the same key and body returns the first response (status and body) for 24
 * hours; the same key with a different body is a `409 IDEMPOTENCY_KEY_REUSED`.
 * Requests without the header pass straight through.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly store: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<IdempotentRequest>();
    const key = headerValue(request.headers['idempotency-key']);
    if (!key) return next.handle();

    const scope = `${request.method} ${request.route?.path ?? request.path}`;
    const bodyHash = hashBody(request.body);
    const existing = this.store.get(scope, key);
    if (existing) {
      if (existing.bodyHash !== bodyHash) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'This Idempotency-Key was used with a different request body',
        });
      }
      const response = context.switchToHttp().getResponse<IdempotentResponse>();
      response.status(existing.status);
      return new Observable((subscriber) => {
        subscriber.next(existing.body);
        subscriber.complete();
      });
    }

    return next.handle().pipe(
      tap((body) => {
        const response = context.switchToHttp().getResponse<IdempotentResponse>();
        this.store.set(scope, key, {
          status: response.statusCode,
          body,
          bodyHash,
          createdAt: new Date(),
        });
      }),
    );
  }
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value && value.trim() !== '' ? value : null;
}

function hashBody(body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(body ?? {}))
    .digest('hex');
}
