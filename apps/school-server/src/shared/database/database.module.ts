import { Module } from '@nestjs/common';
import { SqliteService } from './sqlite.service';
import { DrizzleSqliteService } from './drizzle-sqlite.service';

@Module({
  providers: [SqliteService, DrizzleSqliteService],
  exports: [SqliteService, DrizzleSqliteService],
})
export class DatabaseModule {}
