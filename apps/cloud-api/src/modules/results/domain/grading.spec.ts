import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRADE_BANDS,
  bandForPercent,
  gradeForPercent,
  percentOf,
  roundHalfUp,
  validateGradeBands,
} from './grading';

describe('grading', () => {
  it('covers 0..100 with the default bands', () => {
    const result = validateGradeBands(DEFAULT_GRADE_BANDS);
    expect(result.valid).toBe(true);
    expect(DEFAULT_GRADE_BANDS.map((band) => band.grade)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('grades a percent by band', () => {
    expect(gradeForPercent(85, DEFAULT_GRADE_BANDS)).toBe('A');
    expect(gradeForPercent(70, DEFAULT_GRADE_BANDS)).toBe('A');
    expect(gradeForPercent(69, DEFAULT_GRADE_BANDS)).toBe('B');
    expect(gradeForPercent(44, DEFAULT_GRADE_BANDS)).toBe('E');
    expect(gradeForPercent(0, DEFAULT_GRADE_BANDS)).toBe('F');
    expect(gradeForPercent(100, DEFAULT_GRADE_BANDS)).toBe('A');
  });

  it('exposes the remark of the matching band', () => {
    expect(bandForPercent(85, DEFAULT_GRADE_BANDS)?.remark).toBe('Excellent');
  });

  it('rejects bands with a gap', () => {
    const gaps = [
      { min: 70, max: 100, grade: 'A' },
      { min: 0, max: 69, grade: 'B' },
      // gap between 69 and 70
    ];
    const result = validateGradeBands([
      { min: 71, max: 100, grade: 'A' },
      { min: 0, max: 69, grade: 'F' },
    ]);
    expect(result.valid).toBe(false);
    expect(gaps.length).toBe(2);
    expect(validateGradeBands([]).valid).toBe(false);
  });

  it('rejects bands that do not reach 100 or start at 0', () => {
    expect(validateGradeBands([{ min: 1, max: 100, grade: 'A' }]).valid).toBe(false);
    expect(validateGradeBands([{ min: 0, max: 99, grade: 'A' }]).valid).toBe(false);
  });

  it('computes percent with round-half-up to two places', () => {
    expect(percentOf(34, 40)).toBe(85);
    expect(percentOf(1, 3)).toBe(33.33);
    expect(percentOf(2, 3)).toBe(66.67);
    expect(percentOf(5, 0)).toBe(0);
    expect(roundHalfUp(2.345, 2)).toBe(2.35);
    expect(roundHalfUp(2.344, 2)).toBe(2.34);
  });
});
