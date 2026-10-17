import { describe, expect, it } from 'vitest';
import { computePerformanceTrends } from './trends';

describe('computePerformanceTrends', () => {
  it('groups by subject and reports direction', () => {
    const trend = computePerformanceTrends([
      { examId: 'e1', subjectId: 's1', subjectName: 'Maths', date: '2026-01-01', percent: 50 },
      { examId: 'e2', subjectId: 's1', subjectName: 'Maths', date: '2026-02-01', percent: 70 },
      { examId: 'e3', subjectId: 's2', subjectName: 'English', date: '2026-02-15', percent: 40 },
    ]);

    expect(trend.subjects).toHaveLength(2);
    const maths = trend.subjects.find((subject) => subject.subjectId === 's1')!;
    expect(maths.count).toBe(2);
    expect(maths.latestPercent).toBe(70);
    expect(maths.direction).toBe('up');
    expect(maths.points.map((point) => point.examId)).toEqual(['e1', 'e2']);

    const english = trend.subjects.find((subject) => subject.subjectId === 's2')!;
    expect(english.direction).toBe('flat');
  });

  it('summarises the overall direction', () => {
    const trend = computePerformanceTrends([
      { examId: 'e1', subjectId: null, subjectName: null, date: '2026-01-01', percent: 60 },
      { examId: 'e2', subjectId: null, subjectName: null, date: '2026-02-01', percent: 40 },
    ]);
    expect(trend.overall.direction).toBe('down');
    expect(trend.overall.averagePercent).toBe(50);
    expect(trend.overall.firstPercent).toBe(60);
    expect(trend.overall.latestPercent).toBe(40);
  });

  it('is empty when there are no results', () => {
    const trend = computePerformanceTrends([]);
    expect(trend.subjects).toEqual([]);
    expect(trend.overall.count).toBe(0);
  });
});
