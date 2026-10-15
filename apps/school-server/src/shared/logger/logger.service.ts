import { Injectable, type LoggerService as NestLoggerService } from '@nestjs/common';
import { pino, type Logger } from 'pino';

/**
 * Structured JSON logger (pino) for the school server. Implements the Nest
 * `LoggerService` interface. Sensitive fields are redacted.
 */
@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: Logger;

  constructor() {
    const level = process.env.LOG_LEVEL ?? 'info';
    const serviceName = process.env.SERVICE_NAME ?? 'school-server';
    this.logger = pino({
      level,
      base: { service: serviceName },
      redact: {
        paths: [
          'password',
          '*.password',
          'token',
          '*.token',
          'req.headers.authorization',
          'req.headers.cookie',
          'headers.authorization',
          'headers.cookie',
        ],
        censor: '[REDACTED]',
      },
    });
  }

  log(message: unknown, context?: string): void {
    this.logger.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string): void {
    this.logger.trace({ context }, String(message));
  }

  child(bindings: Record<string, unknown>): Logger {
    return this.logger.child(bindings);
  }

  get instance(): Logger {
    return this.logger;
  }
}
