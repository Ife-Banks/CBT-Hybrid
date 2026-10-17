import type { GradeBand } from './types';

/**
 * Default grade scale (BR-18): A 70-100, B 60-69, C 50-59, D 45-49, E 40-44,
 * F 0-39. Bands are closed intervals and must cover 0..100 with no gaps or
 * overlaps.
 */
export const DEFAULT_GRADE_BANDS: readonly GradeBand[] = [
  { min: 70, max: 100, grade: 'A', remark: 'Excellent' },
  { min: 60, max: 69, grade: 'B', remark: 'Very good' },
  { min: 50, max: 59, grade: 'C', remark: 'Good' },
  { min: 45, max: 49, grade: 'D', remark: 'Fair' },
  { min: 40, max: 44, grade: 'E', remark: 'Pass' },
  { min: 0, max: 39, grade: 'F', remark: 'Fail' },
];

/** Round half away from zero to `decimals` places (matches `round_half_up`). */
export function roundHalfUp(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return rounded / factor;
}

/**
 * `percent = round_half_up(score / max_score * 100, 2)` (API spec 14.5). A zero
 * or missing `max_score` yields 0.
 */
export function percentOf(score: number, maxScore: number): number {
  if (!Number.isFinite(maxScore) || maxScore <= 0) return 0;
  return roundHalfUp((score / maxScore) * 100, 2);
}

export interface BandValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a grade scale. Bands must be non-empty, have `min <= max`, and
 * cover 0..100 exactly once with no gaps or overlaps (settings contract 11.3).
 */
export function validateGradeBands(bands: readonly GradeBand[]): BandValidationResult {
  const errors: string[] = [];
  if (bands.length === 0) {
    return { valid: false, errors: ['A grade scale needs at least one band'] };
  }

  for (const band of bands) {
    if (band.min > band.max) {
      errors.push(`Band ${band.grade} has min ${band.min} greater than max ${band.max}`);
    }
    if (!band.grade) errors.push('Every band needs a grade');
  }

  const sorted = [...bands].sort((a, b) => a.min - b.min);
  if (sorted[0]!.min !== 0) errors.push('Bands must start at 0');
  if (sorted[sorted.length - 1]!.max !== 100) errors.push('Bands must end at 100');

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const next = sorted[i]!;
    if (next.min !== prev.max + 1) {
      errors.push(`Gap or overlap between ${prev.grade} and ${next.grade}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * The band a percent falls into, or `null` when no band matches.
 *
 * Bands are written with integer bounds (`40-44`, `45-49`, ...), but a percent
 * is fractional (`44.44`). A band therefore covers `[min, nextMin)`: the band is
 * the one with the greatest `min` that is still `<= percent`, so `44.44` grades
 * as `40-44` and `100` grades as the top band.
 */
export function bandForPercent(percent: number, bands: readonly GradeBand[]): GradeBand | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  let match: GradeBand | null = null;
  for (const band of bands) {
    if (band.min <= percent && (match === null || band.min > match.min)) {
      match = band;
    }
  }
  return match;
}

/** The grade letter for a percent, or `null` when no band matches. */
export function gradeForPercent(percent: number, bands: readonly GradeBand[]): string | null {
  return bandForPercent(percent, bands)?.grade ?? null;
}
