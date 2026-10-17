import { describe, expect, it } from 'vitest';
import { detectAnomalies } from './anomalies';
import type { QuestionStatistic } from './statistics';

describe('detectAnomalies', () => {
  it('flags a cloud/school score mismatch as critical', () => {
    const anomalies = detectAnomalies('e1', [
      {
        studentId: 's1',
        percent: 80,
        score: 32,
        maxScore: 40,
        schoolScore: 30,
        cloudScore: 32,
        focusLostCount: 0,
      },
    ]);
    expect(anomalies).toEqual([
      expect.objectContaining({ type: 'score_mismatch', severity: 'critical', studentId: 's1' }),
    ]);
  });

  it('flags blank papers and repeated focus loss', () => {
    const anomalies = detectAnomalies('e1', [
      {
        studentId: 's1',
        percent: 0,
        score: 0,
        maxScore: 40,
        schoolScore: 0,
        cloudScore: 0,
        focusLostCount: 4,
      },
    ]);
    const types = anomalies.map((anomaly) => anomaly.type);
    expect(types).toContain('blank_paper');
    expect(types).toContain('focus_loss');
  });

  it('detects statistical outliers once the cohort is large enough', () => {
    const samples = [
      { studentId: 's1', percent: 50, score: 20, maxScore: 40, schoolScore: 20, cloudScore: 20, focusLostCount: 0 },
      { studentId: 's2', percent: 52, score: 21, maxScore: 40, schoolScore: 21, cloudScore: 21, focusLostCount: 0 },
      { studentId: 's3', percent: 48, score: 19, maxScore: 40, schoolScore: 19, cloudScore: 19, focusLostCount: 0 },
      { studentId: 's4', percent: 51, score: 20, maxScore: 40, schoolScore: 20, cloudScore: 20, focusLostCount: 0 },
      { studentId: 's5', percent: 49, score: 20, maxScore: 40, schoolScore: 20, cloudScore: 20, focusLostCount: 0 },
      { studentId: 's6', percent: 5, score: 2, maxScore: 40, schoolScore: 2, cloudScore: 2, focusLostCount: 0 },
    ];
    const anomalies = detectAnomalies('e1', samples);
    expect(anomalies.some((anomaly) => anomaly.type === 'outlier_low' && anomaly.studentId === 's6')).toBe(
      true,
    );
  });

  it('skips outlier detection for small cohorts', () => {
    const anomalies = detectAnomalies('e1', [
      { studentId: 's1', percent: 100, score: 40, maxScore: 40, schoolScore: 40, cloudScore: 40, focusLostCount: 0 },
      { studentId: 's2', percent: 0, score: 0, maxScore: 40, schoolScore: 0, cloudScore: 0, focusLostCount: 0 },
    ]);
    expect(anomalies.some((anomaly) => anomaly.type === 'outlier_high' || anomaly.type === 'outlier_low')).toBe(
      false,
    );
  });

  it('flags questions that are too hard or too easy', () => {
    const questions: QuestionStatistic[] = [
      { questionId: 'q1', attempted: 10, correct: 1, percentCorrect: 10, optionCounts: {} },
      { questionId: 'q2', attempted: 10, correct: 10, percentCorrect: 100, optionCounts: {} },
    ];
    const anomalies = detectAnomalies('e1', [], questions);
    expect(anomalies.map((anomaly) => anomaly.type)).toEqual(['too_hard', 'too_easy']);
  });
});
