export interface TrendEntry {
  examId: string;
  examTitle?: string | null;
  subjectId: string | null;
  subjectName: string | null;
  date: string;
  percent: number;
}

export interface TrendPoint {
  examId: string;
  date: string;
  percent: number;
}

export type TrendDirection = 'up' | 'down' | 'flat';

export interface SubjectTrend {
  subjectId: string | null;
  subjectName: string | null;
  count: number;
  averagePercent: number;
  latestPercent: number;
  direction: TrendDirection;
  points: TrendPoint[];
}

export interface PerformanceTrend {
  subjects: SubjectTrend[];
  overall: {
    count: number;
    averagePercent: number;
    firstPercent: number | null;
    latestPercent: number | null;
    direction: TrendDirection;
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function directionBetween(previous: number, latest: number): TrendDirection {
  const delta = latest - previous;
  if (delta > 0.5) return 'up';
  if (delta < -0.5) return 'down';
  return 'flat';
}

/** Group results by subject and order them over time (US-12.4). */
export function computePerformanceTrends(entries: readonly TrendEntry[]): PerformanceTrend {
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const groups = new Map<string, TrendEntry[]>();
  for (const entry of ordered) {
    const key = entry.subjectId ?? '__unknown__';
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  const subjects: SubjectTrend[] = [...groups.values()].map((points) => {
    const percents = points.map((point) => point.percent);
    const latest = percents[percents.length - 1] ?? 0;
    const previous = percents.length > 1 ? percents[percents.length - 2]! : latest;
    return {
      subjectId: points[0]!.subjectId,
      subjectName: points[0]!.subjectName,
      count: points.length,
      averagePercent: round2(percents.reduce((total, value) => total + value, 0) / points.length),
      latestPercent: round2(latest),
      direction: directionBetween(previous, latest),
      points: points.map((point) => ({
        examId: point.examId,
        date: point.date,
        percent: round2(point.percent),
      })),
    };
  });

  const overallPercents = ordered.map((entry) => entry.percent);
  const first = overallPercents[0] ?? null;
  const latestOverall = overallPercents[overallPercents.length - 1] ?? null;
  return {
    subjects,
    overall: {
      count: ordered.length,
      averagePercent:
        overallPercents.length === 0
          ? 0
          : round2(
              overallPercents.reduce((total, value) => total + value, 0) / overallPercents.length,
            ),
      firstPercent: first === null ? null : round2(first),
      latestPercent: latestOverall === null ? null : round2(latestOverall),
      direction:
        first === null || latestOverall === null ? 'flat' : directionBetween(first, latestOverall),
    },
  };
}
