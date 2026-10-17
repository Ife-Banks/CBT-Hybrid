import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { DatabaseModule } from '../../shared/database/database.module';
import { DrizzleService } from '../../shared/database/drizzle.service';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { DrizzleStudentDataRepository } from './drizzle-student-data.repository';
import { StudentDataController } from './student-data.controller';
import { StudentDataService } from './student-data.service';
import {
  InMemoryStudentDataRepository,
  STUDENT_DATA_REPOSITORY,
} from './student-data.repository';

/**
 * Student data export and anonymisation (API spec 5, US-16.2). Uses Drizzle
 * when DATABASE_URL is configured, otherwise the in-memory repository.
 */
@Module({
  imports: [DatabaseModule.register(), AuthModule, SettingsModule],
  controllers: [StudentDataController],
  providers: [
    {
      provide: STUDENT_DATA_REPOSITORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) =>
        config.get('DATABASE_URL')
          ? new DrizzleStudentDataRepository(drizzle)
          : new InMemoryStudentDataRepository(),
      inject: [ConfigService, DrizzleService],
    },
    StudentDataService,
  ],
})
export class StudentDataModule {}
