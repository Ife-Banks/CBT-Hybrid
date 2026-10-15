import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { LoggerService } from '../../shared/logger/logger.service';

/** Injection token for {@link Notifier}. */
export const NOTIFIER = Symbol('NOTIFIER');

/** A password-reset one-time code to deliver to a user. */
export interface PasswordResetMessage {
  /** Email or phone the code is sent to. */
  to: string;
  fullName: string;
  code: string;
}

/**
 * Delivery port for one-time codes. Phase 2 ships a logging implementation; the
 * real email (staff) and SMS/email (parents) transports land with the
 * notification work in a later phase. Tests substitute a capturing fake.
 */
export interface Notifier {
  sendPasswordReset(message: PasswordResetMessage): Promise<void>;
}

@Injectable()
export class LoggingNotifier implements Notifier {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async sendPasswordReset(message: PasswordResetMessage): Promise<void> {
    // Outside production the code is logged so the flow can be exercised by hand.
    // Production never logs the code; the transport will send it instead.
    const suffix = this.config.isProduction ? '' : ` code=${message.code}`;
    this.logger.log(`password reset code issued for ${message.to}${suffix}`, 'Notifier');
  }
}
