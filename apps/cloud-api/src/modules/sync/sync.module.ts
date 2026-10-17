import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SyncController } from './sync.controller';
import { CloudSyncStore } from './sync.store';
import { ResultsModule } from '../results/results.module';

@Module({
  imports: [ConfigModule, ResultsModule],
  controllers: [SyncController],
  providers: [CloudSyncStore],
  exports: [CloudSyncStore],
})
export class SyncModule {}
