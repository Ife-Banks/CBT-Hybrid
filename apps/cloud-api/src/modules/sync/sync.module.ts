import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SyncController } from './sync.controller';

@Module({
  imports: [ConfigModule],
  controllers: [SyncController],
  providers: [],
})
export class SyncModule {}