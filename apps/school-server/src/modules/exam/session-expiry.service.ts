import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { LoggerService } from '../../shared/logger/logger.service';
import { ExamSessionService } from './exam-session.service';

/** How often the expiry sweep runs (API spec 16.9). */
export const EXPIRY_SWEEP_MS = 5000;

/**
 * Submits sessions whose time is up or whose sitting window has closed. This is
 * what covers a dead PC: the client is never trusted to end its own session.
 */
@Injectable()
export class SessionExpiryService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly sessions: ExamSessionService,
    private readonly config: SchoolConfigService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    // Skip the timer in tests so the process can exit promptly; the sweep has
    // its own unit test.
    if (this.config.get('NODE_ENV') === 'test') return;

    this.timer = setInterval(() => void this.sweep(), EXPIRY_SWEEP_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sweep(): Promise<void> {
    try {
      const result = await this.sessions.expireDue();
      if (result.time_up > 0 || result.window_closed > 0) {
        this.logger.log(
          `Expired ${result.time_up} session(s) on time and ${result.window_closed} on window close`,
          'SessionExpiryService',
        );
      }
    } catch (error) {
      this.logger.error(
        'Session expiry sweep failed',
        error instanceof Error ? error.message : String(error),
        'SessionExpiryService',
      );
    }
  }
}
