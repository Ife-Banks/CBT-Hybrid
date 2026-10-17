import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SyncController } from './sync.controller';
import { CloudSyncStore } from './sync.store';

@Module({
  imports: [ConfigModule],
  controllers: [SyncController],
  providers: [CloudSyncStore],
  exports: [CloudSyncStore],
})
export class SyncModule {}
