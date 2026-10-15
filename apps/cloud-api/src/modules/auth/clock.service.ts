import { Injectable } from '@nestjs/common';

/**
 * Wall-clock access, isolated so tests can freeze or advance time (sessions,
 * lockouts and one-time-code expiry all depend on it). Override the provider in
 * tests with a controllable implementation.
 */
@Injectable()
export class ClockService {
  now(): Date {
    return new Date();
  }

  nowMs(): number {
    return Date.now();
  }
}
