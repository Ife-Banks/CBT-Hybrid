import { Global, Module } from '@nestjs/common';
import { SchoolConfigService } from './school-config.service';

/** Makes {@link SchoolConfigService} available everywhere. */
@Global()
@Module({
  providers: [SchoolConfigService],
  exports: [SchoolConfigService],
})
export class SchoolConfigModule {}
