import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import {
  DrizzleStudentRepository,
  DrizzleStudentCodeRepository,
  DrizzleGuardianRepository,
  DrizzleGuardianshipRepository,
  DrizzleInvitationRepository,
} from './repositories';
import { DatabaseModule } from '../../shared/database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ...(process.env.DATABASE_URL ? [DatabaseModule] : []),
    AuthModule,
  ],
  controllers: process.env.DATABASE_URL ? [UsersController] : [],
  providers: [
    ...(process.env.DATABASE_URL ? [UsersService] : []),
    ...(process.env.DATABASE_URL
      ? [
          DrizzleStudentRepository,
          DrizzleStudentCodeRepository,
          DrizzleGuardianRepository,
          DrizzleGuardianshipRepository,
          DrizzleInvitationRepository,
        ]
      : []),
  ],
  exports: process.env.DATABASE_URL ? [UsersService] : [],
})
export class UsersModule {}
