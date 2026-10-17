import type { ResultStatus } from './types';

/**
 * Result status machine (BR-14). Only `reviewed` results may be released; a
 * `released` or `withdrawn` result can still be withdrawn, and a re-mark of a
 * released result keeps it released with an "updated" flag (BR-15).
 */
const TRANSITIONS: Record<ResultStatus, readonly ResultStatus[]> = {
  draft: ['reviewed', 'withdrawn'],
  reviewed: ['released', 'withdrawn'],
  released: ['withdrawn'],
  withdrawn: [],
};

/** Whether a result in `from` may move to `to`. */
export function canTransition(from: ResultStatus, to: ResultStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** A result is reviewable when it is still a draft. */
export function canReview(status: ResultStatus): boolean {
  return status === 'draft';
}

/** Only reviewed results may be released (BR-14). */
export function canRelease(status: ResultStatus): boolean {
  return status === 'reviewed';
}

/** Drafts, reviews and released results can be withdrawn. */
export function canWithdraw(status: ResultStatus): boolean {
  return TRANSITIONS[status].includes('withdrawn');
}

/** Parents only ever see released results (BR-14). */
export function isParentVisible(status: ResultStatus): boolean {
  return status === 'released';
}
