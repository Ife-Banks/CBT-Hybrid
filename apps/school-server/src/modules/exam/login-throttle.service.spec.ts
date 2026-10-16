import { describe, expect, it } from 'vitest';
import { LOGIN_FAILURE_LIMIT, LoginThrottleService } from './login-throttle.service';

describe('LoginThrottleService', () => {
  it('locks a seat on the fifth failure inside a minute', () => {
    const throttle = new LoginThrottleService();
    const seat = 'PC-12';

    for (let attempt = 1; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
      throttle.recordFailure(seat, 1_000);
      expect(throttle.isLocked(seat, 1_000)).toBe(false);
    }

    throttle.recordFailure(seat, 1_000);
    expect(throttle.isLocked(seat, 1_000)).toBe(true);
  });

  it('forgets failures older than the window', () => {
    const throttle = new LoginThrottleService();
    const seat = 'PC-12';

    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
      throttle.recordFailure(seat, 1_000);
    }
    expect(throttle.isLocked(seat, 1_000)).toBe(true);

    // 61 seconds later the window has slid past every failure.
    expect(throttle.isLocked(seat, 62_000)).toBe(false);
  });

  it('counts each seat separately', () => {
    const throttle = new LoginThrottleService();

    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
      throttle.recordFailure('PC-12', 1_000);
    }

    expect(throttle.isLocked('PC-12', 1_000)).toBe(true);
    expect(throttle.isLocked('PC-13', 1_000)).toBe(false);
  });

  it('clears a seat after a successful login', () => {
    const throttle = new LoginThrottleService();
    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
      throttle.recordFailure('PC-12', 1_000);
    }

    throttle.clear('PC-12');
    expect(throttle.isLocked('PC-12', 1_000)).toBe(false);
  });
});
