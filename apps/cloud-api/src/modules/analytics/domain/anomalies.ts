import type { QuestionStatistic } from './statistics';

export type AnomalyType =
  | 'score_mismatch'
  | 'blank_paper'
  | 'focus_loss'
  | 'too_hard'
  | 'too_easy'
  | 'outlier_low'
  | 'outlier_high';

export type AnomalySeverity = 'info' | 'warning' | 'critical';

export interface Anomaly {
  type: AnomalyType;
  examId: string;
  severity: AnomalySeverity;
  message: string;
  studentId?: string;
  questionId?: string;
}

export interface AnomalyResultSample {
  studentId: string;
  percent: number;
  score: number;
  maxScore: number;
  schoolScore: number | null;
  cloudScore: number | null;
  focusLostCount: number;
}

export interface AnomalyOptions {
  /** Minimum cohort size before outlier detection runs. */
  minCohort?: number;
  /** Standard deviations beyond the mean that count as an outlier. */
  outlierStdDev?: number;
  /** Focus losses at or above this count raise a flag. */
  focusLossThreshold?: number;
  /** Minimum attempts before a question is judged too hard or too easy. */
  minQuestionAttempts?: number;
}

const DEFAULTS: Required<AnomalyOptions> = {
  minCohort: 5,
  outlierStdDev: 2,
  focusLossThreshold: 3,
  minQuestionAttempts: 5,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Surface patterns a teacher should look at: cloud/school score mismatches,
 * blank papers, focus losses, statistical outliers and questions that are much
 * harder or easier than expected (Epic 11 analytics).
 */
export function detectAnomalies(
  examId: string,
  samples: readonly AnomalyResultSample[],
  questionStats: readonly QuestionStatistic[] = [],
  options: AnomalyOptions = {},
): Anomaly[] {
  const config = { ...DEFAULTS, ...options };
  const anomalies: Anomaly[] = [];

  for (const sample of samples) {
    if (
      sample.schoolScore !== null &&
      sample.cloudScore !== null &&
      Math.abs(sample.schoolScore - sample.cloudScore) > 0.005
    ) {
      anomalies.push({
        type: 'score_mismatch',
        examId,
        severity: 'critical',
        studentId: sample.studentId,
        message: `Cloud score ${round2(sample.cloudScore)} differs from school score ${round2(sample.schoolScore)}`,
      });
    }
    if (sample.maxScore > 0 && sample.score === 0) {
      anomalies.push({
        type: 'blank_paper',
        examId,
        severity: 'warning',
        studentId: sample.studentId,
        message: 'No marks scored; the paper may be blank or the answers did not upload',
      });
    }
    if (sample.focusLostCount >= config.focusLossThreshold) {
      anomalies.push({
        type: 'focus_loss',
        examId,
        severity: 'warning',
        studentId: sample.studentId,
        message: `Focus was lost ${sample.focusLostCount} times`,
      });
    }
  }

  if (samples.length >= config.minCohort) {
    const percents = samples.map((sample) => sample.percent);
    const mean = percents.reduce((total, value) => total + value, 0) / percents.length;
    const variance = percents.reduce((total, value) => total + (value - mean) ** 2, 0) / percents.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev > 0) {
      for (const sample of samples) {
        const z = (sample.percent - mean) / stdDev;
        if (z <= -config.outlierStdDev) {
          anomalies.push({
            type: 'outlier_low',
            examId,
            severity: 'warning',
            studentId: sample.studentId,
            message: `Scored ${sample.percent}%, far below the class average of ${round2(mean)}%`,
          });
        } else if (z >= config.outlierStdDev) {
          anomalies.push({
            type: 'outlier_high',
            examId,
            severity: 'info',
            studentId: sample.studentId,
            message: `Scored ${sample.percent}%, far above the class average of ${round2(mean)}%`,
          });
        }
      }
    }
  }

  for (const stat of questionStats) {
    if (stat.attempted < config.minQuestionAttempts) continue;
    if (stat.percentCorrect < 20) {
      anomalies.push({
        type: 'too_hard',
        examId,
        severity: 'warning',
        questionId: stat.questionId,
        message: `Only ${stat.percentCorrect}% answered correctly; review the key or the teaching`,
      });
    } else if (stat.percentCorrect > 95) {
      anomalies.push({
        type: 'too_easy',
        examId,
        severity: 'info',
        questionId: stat.questionId,
        message: `${stat.percentCorrect}% answered correctly; the question may not discriminate`,
      });
    }
  }

  return anomalies;
}
