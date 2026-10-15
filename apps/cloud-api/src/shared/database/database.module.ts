import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { DrizzleService } from './drizzle.service';

@Module({
  providers: [DrizzleService],
  exports: [DrizzleService],
})
export class DatabaseModule {
  static register() {
    return {
      module: DatabaseModule,
      global: true,
    };
  }
}
