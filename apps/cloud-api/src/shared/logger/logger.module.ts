import { Global, Module } from '@nestjs/common';
import { LoggerService } from './logger.service';

/** Makes {@link LoggerService} available everywhere without re-importing. */
@Global()
@Module({
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
