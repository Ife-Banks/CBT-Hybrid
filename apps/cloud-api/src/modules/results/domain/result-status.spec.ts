import { describe, expect, it } from 'vitest';
import { canRelease, canReview, canTransition, canWithdraw, isParentVisible } from './result-status';

describe('result status machine', () => {
  it('allows the BR-14 transitions', () => {
    expect(canTransition('draft', 'reviewed')).toBe(true);
    expect(canTransition('reviewed', 'released')).toBe(true);
    expect(canTransition('draft', 'released')).toBe(false);
    expect(canTransition('withdrawn', 'reviewed')).toBe(false);
  });

  it('only releases reviewed results', () => {
    expect(canRelease('reviewed')).toBe(true);
    expect(canRelease('draft')).toBe(false);
    expect(canRelease('released')).toBe(false);
    expect(canRelease('withdrawn')).toBe(false);
  });

  it('only reviews drafts', () => {
    expect(canReview('draft')).toBe(true);
    expect(canReview('reviewed')).toBe(false);
  });

  it('withdraws any visible state', () => {
    expect(canWithdraw('draft')).toBe(true);
    expect(canWithdraw('reviewed')).toBe(true);
    expect(canWithdraw('released')).toBe(true);
    expect(canWithdraw('withdrawn')).toBe(false);
  });

  it('hides everything but released from parents', () => {
    expect(isParentVisible('released')).toBe(true);
    expect(isParentVisible('draft')).toBe(false);
    expect(isParentVisible('withdrawn')).toBe(false);
  });
});
