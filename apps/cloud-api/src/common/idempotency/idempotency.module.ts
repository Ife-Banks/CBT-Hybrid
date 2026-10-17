import { Global, Module } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

/**
 * Global idempotency support (API spec 1.6). Routes opt in with
 * `@UseInterceptors(IdempotencyInterceptor)`; the store is shared so a replay
 * returns the original response regardless of which module handled it.
 */
@Global()
@Module({
  providers: [IdempotencyService, IdempotencyInterceptor],
  exports: [IdempotencyService, IdempotencyInterceptor],
})
export class IdempotencyModule {}
