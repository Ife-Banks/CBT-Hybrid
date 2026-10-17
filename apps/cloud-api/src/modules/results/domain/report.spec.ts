import { describe, expect, it } from 'vitest';
import { BuildResultReport } from './report';

describe('BuildResultReport', () => {
  it('summarises a class sheet and sorts by percent', () => {
    const report = new BuildResultReport().build({
      exam: { id: 'e1', title: 'Maths', subjectName: 'Mathematics', passMarkPct: 50 },
      classId: 'c1',
      rows: [
        { studentId: 's1', studentName: 'Ada', admissionNo: 'A1', score: 20, maxScore: 40, percent: 50, grade: 'C', status: 'draft' },
        { studentId: 's2', studentName: 'Bola', admissionNo: 'A2', score: 36, maxScore: 40, percent: 90, grade: 'A', status: 'draft' },
        { studentId: 's3', studentName: 'Chidi', admissionNo: 'A3', score: 8, maxScore: 40, percent: 20, grade: 'F', status: 'draft' },
      ],
    });

    expect(report.summary.count).toBe(3);
    expect(report.summary.averagePercent).toBe(53.33);
    expect(report.summary.highestPercent).toBe(90);
    expect(report.summary.lowestPercent).toBe(20);
    expect(report.summary.passRate).toBe(66.67);
    expect(report.rows.map((row) => row.studentId)).toEqual(['s2', 's1', 's3']);
  });

  it('handles an empty class', () => {
    const report = new BuildResultReport().build({
      exam: { id: 'e1', title: 'Maths', subjectName: null, passMarkPct: null },
      classId: null,
      rows: [],
    });
    expect(report.summary.count).toBe(0);
    expect(report.summary.passRate).toBeNull();
  });
});
