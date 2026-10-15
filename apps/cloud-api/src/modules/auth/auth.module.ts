import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TotpService } from './totp.service';
import { AbilityFactory } from './abilities/ability.factory';
import { AuditService } from './audit/audit.service';
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

/**
 * Authentication and authorization (CBT-04 M2; API spec sections 1.3 and 3).
 *
 * The three guards are registered globally in this order: authenticate, then
 * check CSRF, then check CASL abilities. Repositories are bound to in-memory
 * implementations for Phase 2; the Drizzle-backed ones replace these providers
 * once the data layer exists.
 */
@Module({
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
    { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
    { provide: SESSION_REPOSITORY, useClass: InMemorySessionRepository },
    { provide: OTP_CHALLENGE_REPOSITORY, useClass: InMemoryOtpChallengeRepository },
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
  ],
})
export class AuthModule {}
