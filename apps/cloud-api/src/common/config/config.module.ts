import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service';

/** Makes {@link ConfigService} available everywhere without re-importing. */
@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
