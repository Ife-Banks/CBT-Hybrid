import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../shared/logger/logger.service';

/** Injection token for {@link GuardianNotifier}. */
export const GUARDIAN_NOTIFIER = Symbol('GUARDIAN_NOTIFIER');

/** A verification code to deliver when a parent adds or changes an email. */
export interface GuardianEmailMessage {
  to: string;
  fullName: string;
  code: string;
}

/**
 * Delivery port for a parent's email-verification code (API spec section 10).
 * The real email transport lands with the notification work; tests substitute a
 * capturing fake.
 */
export interface GuardianNotifier {
  sendEmailVerification(message: GuardianEmailMessage): Promise<void>;
}

@Injectable()
export class LoggingGuardianNotifier implements GuardianNotifier {
  constructor(private readonly logger: LoggerService) {}

  async sendEmailVerification(message: GuardianEmailMessage): Promise<void> {
    this.logger.log(`Guardian email verification for ${message.to}`, 'GuardianNotifier');
  }
}
