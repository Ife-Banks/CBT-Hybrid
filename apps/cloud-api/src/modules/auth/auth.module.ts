import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '../../common/config/config.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TotpService } from './totp.service';
import { AbilityFactory } from './abilities/ability.factory';
import { AUDIT_LOG_REPOSITORY, InMemoryAuditLogRepository } from './audit/audit-log.repository';
import { AuditService } from './audit/audit.service';
import { DrizzleAuditLogRepository } from './audit/drizzle-audit-log.repository';
import { ClockService } from './clock.service';
import { LoggingNotifier, NOTIFIER } from './notifier';
import { USER_REPOSITORY, InMemoryUserRepository } from './repositories/user.repository';
import { SESSION_REPOSITORY, InMemorySessionRepository } from './repositories/session.repository';
import {
  OTP_CHALLENGE_REPOSITORY,
  InMemoryOtpChallengeRepository,
} from './repositories/otp.repository';
import { AuthGuard } from './guards/auth.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { AbilitiesGuard } from './guards/abilities.guard';
import { DevSeedService } from './dev-seed.service';
import { DrizzleUserRepository } from './repositories/drizzle-user.repository';
import { DrizzleSessionRepository } from './repositories/drizzle-session.repository';
import { DrizzleOtpChallengeRepository } from './repositories/drizzle-otp.repository';
import { DrizzleService } from '../../shared/database/drizzle.service';
import { DatabaseModule } from '../../shared/database/database.module';

/**
 * Authentication and authorization (CBT-04 M2; API spec sections 1.3 and 3).
 *
 * The three guards are registered globally in this order: authenticate, then
 * check CSRF, then check CASL abilities. Repositories use Drizzle when
 * DATABASE_URL is configured, otherwise fall back to in-memory implementations.
 */
@Module({
  imports: [DatabaseModule.register()],
  controllers: [AuthController],
  providers: [
    PasswordService,
    TotpService,
    SessionService,
    AbilityFactory,
    AuditService,
    ClockService,
    AuthService,
    DevSeedService,
    DrizzleService,
    {
      provide: USER_REPOSITORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) => {
        return config.get('DATABASE_URL')
          ? new DrizzleUserRepository(drizzle)
          : new InMemoryUserRepository();
      },
      inject: [ConfigService, DrizzleService],
    },
    {
      provide: SESSION_REPOSITORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) => {
        return config.get('DATABASE_URL')
          ? new DrizzleSessionRepository(drizzle)
          : new InMemorySessionRepository();
      },
      inject: [ConfigService, DrizzleService],
    },
    {
      provide: OTP_CHALLENGE_REPOSITORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) => {
        return config.get('DATABASE_URL')
          ? new DrizzleOtpChallengeRepository(drizzle)
          : new InMemoryOtpChallengeRepository();
      },
      inject: [ConfigService, DrizzleService],
    },
    {
      provide: AUDIT_LOG_REPOSITORY,
      useFactory: (config: ConfigService, drizzle: DrizzleService) => {
        return config.get('DATABASE_URL')
          ? new DrizzleAuditLogRepository(drizzle)
          : new InMemoryAuditLogRepository();
      },
      inject: [ConfigService, DrizzleService],
    },
    { provide: NOTIFIER, useClass: LoggingNotifier },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AbilitiesGuard },
  ],
  exports: [
    AuthService,
    PasswordService,
    SessionService,
    AbilityFactory,
    AuditService,
    USER_REPOSITORY,
    SESSION_REPOSITORY,
    OTP_CHALLENGE_REPOSITORY,
    AUDIT_LOG_REPOSITORY,
  ],
})
export class AuthModule {}
