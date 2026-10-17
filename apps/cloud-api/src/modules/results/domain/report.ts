import type { ResultStatus } from './types';

export interface ResultReportRow {
  studentId: string;
  studentName: string | null;
  admissionNo: string | null;
  score: number;
  maxScore: number;
  percent: number;
  grade: string | null;
  status: ResultStatus;
}

export interface ResultReportInput {
  exam: {
    id: string;
    title: string;
    subjectName: string | null;
    passMarkPct: number | null;
  };
  classId: string | null;
  rows: ResultReportRow[];
}

export interface ResultReportSummary {
  count: number;
  averagePercent: number;
  highestPercent: number;
  lowestPercent: number;
  passRate: number | null;
}

export interface ResultReport {
  exam: ResultReportInput['exam'];
  classId: string | null;
  generatedAt: string;
  summary: ResultReportSummary;
  rows: ResultReportRow[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Builds a class results sheet (US-11.6). The document encoders consume this
 * structure; the statistics are the same ones the analytics engine reports.
 */
export class BuildResultReport {
  build(input: ResultReportInput): ResultReport {
    const percents = input.rows.map((row) => row.percent);
    const count = percents.length;
    const sum = percents.reduce((total, value) => total + value, 0);
    const averagePercent = count === 0 ? 0 : round2(sum / count);
    const highestPercent = count === 0 ? 0 : round2(Math.max(...percents));
    const lowestPercent = count === 0 ? 0 : round2(Math.min(...percents));
    const passRate =
      input.exam.passMarkPct === null || count === 0
        ? null
        : round2(
            (percents.filter((percent) => percent >= input.exam.passMarkPct!).length / count) * 100,
          );

    return {
      exam: input.exam,
      classId: input.classId,
      generatedAt: new Date().toISOString(),
      summary: { count, averagePercent, highestPercent, lowestPercent, passRate },
      rows: [...input.rows].sort((a, b) => b.percent - a.percent),
    };
  }
}
