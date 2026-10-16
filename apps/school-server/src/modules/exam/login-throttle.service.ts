import { Injectable } from '@nestjs/common';

/** Failures allowed per seat before it is locked. */
export const LOGIN_FAILURE_LIMIT = 5;

/** Window over which failures are counted. */
export const LOGIN_FAILURE_WINDOW_MS = 60 * 1000;

/**
 * Tracks failed exam-client logins per seat (API spec 16.3, US-10.1). The fifth
 * failure within a minute returns `SEAT_LOCKED`, which stops one PC from being
 * used to guess codes and keys. State is in memory: seat throttling only has to
 * survive while the server is up.
 */
@Injectable()
export class LoginThrottleService {
  private readonly failures = new Map<string, number[]>();

  recordFailure(seat: string, now = Date.now()): void {
    const recent = this.prune(seat, now);
    recent.push(now);
    this.failures.set(seat, recent);
  }

  /** True when the seat has hit the failure limit inside the window. */
  isLocked(seat: string, now = Date.now()): boolean {
    return this.prune(seat, now).length >= LOGIN_FAILURE_LIMIT;
  }

  clear(seat: string): void {
    this.failures.delete(seat);
  }

  private prune(seat: string, now: number): number[] {
    const cutoff = now - LOGIN_FAILURE_WINDOW_MS;
    const recent = (this.failures.get(seat) ?? []).filter((at) => at > cutoff);
    this.failures.set(seat, recent);
    return recent;
  }
}
