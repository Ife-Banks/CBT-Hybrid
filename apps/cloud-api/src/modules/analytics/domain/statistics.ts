import type { PackAnswerValue } from '@cbt/exam-core';

export interface ScoreSample {
  percent: number;
  grade: string | null;
}

export interface AggregateStatistics {
  count: number;
  averagePercent: number;
  highestPercent: number;
  lowestPercent: number;
  medianPercent: number;
  stdDev: number;
  passRate: number | null;
  gradeDistribution: Record<string, number>;
}

export interface QuestionMeta {
  questionId: string;
  optionIds: string[];
}

export interface AnswerSample {
  questionId: string;
  answer: PackAnswerValue;
  marks: number;
  maxMarks: number;
}

export interface QuestionStatistic {
  questionId: string;
  attempted: number;
  correct: number;
  percentCorrect: number;
  optionCounts: Record<string, number>;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Mean/median/spread/pass-rate/grade distribution for one class+exam. */
export function computeAggregateStatistics(
  samples: readonly ScoreSample[],
  passMarkPct: number | null,
): AggregateStatistics {
  const percents = samples.map((sample) => sample.percent);
  const count = percents.length;
  if (count === 0) {
    return {
      count: 0,
      averagePercent: 0,
      highestPercent: 0,
      lowestPercent: 0,
      medianPercent: 0,
      stdDev: 0,
      passRate: null,
      gradeDistribution: {},
    };
  }

  const sum = percents.reduce((total, value) => total + value, 0);
  const average = sum / count;
  const sorted = [...percents].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const median = count % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  const variance = percents.reduce((total, value) => total + (value - average) ** 2, 0) / count;

  const gradeDistribution: Record<string, number> = {};
  for (const sample of samples) {
    const key = sample.grade ?? 'ungraded';
    gradeDistribution[key] = (gradeDistribution[key] ?? 0) + 1;
  }

  return {
    count,
    averagePercent: round2(average),
    highestPercent: round2(Math.max(...percents)),
    lowestPercent: round2(Math.min(...percents)),
    medianPercent: round2(median),
    stdDev: round2(Math.sqrt(variance)),
    passRate:
      passMarkPct === null
        ? null
        : round2((percents.filter((percent) => percent >= passMarkPct).length / count) * 100),
    gradeDistribution,
  };
}

/** Per-question percent correct and option choice counts (US-11.3). */
export function computeQuestionStatistics(
  questions: readonly QuestionMeta[],
  answers: readonly AnswerSample[],
): QuestionStatistic[] {
  return questions.map((question) => {
    const chosen = answers.filter(
      (answer) => answer.questionId === question.questionId && answer.answer !== null,
    );
    const correct = chosen.filter(
      (answer) => answer.maxMarks > 0 && answer.marks >= answer.maxMarks,
    ).length;
    const optionCounts: Record<string, number> = {};
    for (const optionId of question.optionIds) optionCounts[optionId] = 0;
    for (const answer of chosen) {
      const value = answer.answer;
      if (value && typeof value === 'object' && 'option_id' in value && value.option_id) {
        optionCounts[value.option_id] = (optionCounts[value.option_id] ?? 0) + 1;
      } else if (value && typeof value === 'object' && 'option_ids' in value && Array.isArray(value.option_ids)) {
        for (const optionId of value.option_ids) {
          optionCounts[optionId] = (optionCounts[optionId] ?? 0) + 1;
        }
      }
    }
    return {
      questionId: question.questionId,
      attempted: chosen.length,
      correct,
      percentCorrect: chosen.length === 0 ? 0 : round2((correct / chosen.length) * 100),
      optionCounts,
    };
  });
}
