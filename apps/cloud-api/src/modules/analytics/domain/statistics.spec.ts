import { describe, expect, it } from 'vitest';
import { computeAggregateStatistics, computeQuestionStatistics } from './statistics';

describe('computeAggregateStatistics', () => {
  it('computes mean, spread, pass rate and grade distribution', () => {
    const stats = computeAggregateStatistics(
      [
        { percent: 90, grade: 'A' },
        { percent: 80, grade: 'A' },
        { percent: 60, grade: 'B' },
        { percent: 30, grade: 'F' },
      ],
      50,
    );

    expect(stats.count).toBe(4);
    expect(stats.averagePercent).toBe(65);
    expect(stats.medianPercent).toBe(70);
    expect(stats.highestPercent).toBe(90);
    expect(stats.lowestPercent).toBe(30);
    expect(stats.passRate).toBe(75);
    expect(stats.stdDev).toBe(22.91);
    expect(stats.gradeDistribution).toEqual({ A: 2, B: 1, F: 1 });
  });

  it('returns zeroes for an empty cohort', () => {
    const stats = computeAggregateStatistics([], 50);
    expect(stats.count).toBe(0);
    expect(stats.passRate).toBeNull();
    expect(stats.averagePercent).toBe(0);
  });
});

describe('computeQuestionStatistics', () => {
  it('computes percent correct and option counts', () => {
    const stats = computeQuestionStatistics(
      [{ questionId: 'q1', optionIds: ['a', 'b', 'c'] }],
      [
        { questionId: 'q1', answer: { option_id: 'a' }, marks: 1, maxMarks: 1 },
        { questionId: 'q1', answer: { option_id: 'b' }, marks: 0, maxMarks: 1 },
        { questionId: 'q1', answer: { option_id: 'a' }, marks: 1, maxMarks: 1 },
        { questionId: 'q1', answer: null, marks: 0, maxMarks: 1 },
      ],
    );

    expect(stats[0]!.attempted).toBe(3);
    expect(stats[0]!.correct).toBe(2);
    expect(stats[0]!.percentCorrect).toBe(66.67);
    expect(stats[0]!.optionCounts).toEqual({ a: 2, b: 1, c: 0 });
  });

  it('counts multi-choice option ids', () => {
    const stats = computeQuestionStatistics(
      [{ questionId: 'q1', optionIds: ['a', 'b'] }],
      [{ questionId: 'q1', answer: { option_ids: ['a', 'b'] }, marks: 2, maxMarks: 2 }],
    );
    expect(stats[0]!.optionCounts).toEqual({ a: 1, b: 1 });
  });
});
