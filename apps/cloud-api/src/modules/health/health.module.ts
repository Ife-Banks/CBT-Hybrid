import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from '../../shared/database/database.module';

@Module({
  imports: [DatabaseModule.register()],
  controllers: [HealthController],
})
export class HealthModule {}
