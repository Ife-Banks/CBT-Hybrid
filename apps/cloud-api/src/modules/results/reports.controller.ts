import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { requireSchool } from '../../common/request-context';
import { CheckAbilities } from '../auth/decorators/check-abilities.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthContext } from '../auth/domain/types';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ResultsService } from './results.service';
import { toCsv } from './domain/csv';
import { writePdf } from './domain/pdf';
import { writeXlsx } from './domain/xlsx';
import type { ResultReport } from './domain/report';

/** The slice of the HTTP response the download routes use. */
interface DownloadResponse {
  setHeader(name: string, value: string): void;
  send(body: Buffer | string): void;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME = 'application/pdf';
const CSV_MIME = 'text/csv; charset=utf-8';

/**
 * Result reports (US-11.6/11.7, API spec 9.2). The structured report is
 * available as JSON; the `.csv`, `.xlsx` and `.pdf` routes download it. The
 * `.xlsx` is a real Office Open XML workbook (built with the exam-core ZIP
 * writer) and the `.pdf` is a minimal text document.
 */
@Controller()
@UseGuards(AuthGuard, AbilitiesGuard)
export class ReportsController {
  constructor(private readonly results: ResultsService) {}

  @Get('exams/:examId/result-report')
  @CheckAbilities({ action: 'read', subject: 'Report' })
  async examReport(
    @CurrentAuth() auth: AuthContext,
    @Param('examId') examId: string,
    @Query('class_id') classId?: string,
  ): Promise<ResultReport> {
    const schoolId = requireSchool(auth);
    return this.results.generateResultReport(schoolId, examId, classId);
  }

  @Get('exams/:examId/results.xlsx')
  @CheckAbilities({ action: 'read', subject: 'Report' })
  async examResultsXlsx(
    @CurrentAuth() auth: AuthContext,
    @Res() res: DownloadResponse,
    @Param('examId') examId: string,
    @Query('class_id') classId?: string,
  ): Promise<void> {
    const schoolId = requireSchool(auth);
    const report = await this.results.generateResultReport(schoolId, examId, classId);
    const bytes = writeXlsx({ name: 'Results', rows: reportToXlsxRows(report) });
    send(res, XLSX_MIME, `${slug(report.exam.title)}-results.xlsx`, Buffer.from(bytes));
  }

  @Get('exams/:examId/results.csv')
  @CheckAbilities({ action: 'read', subject: 'Report' })
  async examResultsCsv(
    @CurrentAuth() auth: AuthContext,
    @Res() res: DownloadResponse,
    @Param('examId') examId: string,
    @Query('class_id') classId?: string,
  ): Promise<void> {
    const schoolId = requireSchool(auth);
    const report = await this.results.generateResultReport(schoolId, examId, classId);
    send(res, CSV_MIME, `${slug(report.exam.title)}-results.csv`, toCsv(reportToXlsxRows(report)));
  }

  @Get('exams/:examId/results.pdf')
  @CheckAbilities({ action: 'read', subject: 'Report' })
  async examResultsPdf(
    @CurrentAuth() auth: AuthContext,
    @Res() res: DownloadResponse,
    @Param('examId') examId: string,
    @Query('class_id') classId?: string,
  ): Promise<void> {
    const schoolId = requireSchool(auth);
    const report = await this.results.generateResultReport(schoolId, examId, classId);
    const bytes = writePdf({ title: report.exam.title, lines: reportToLines(report) });
    send(res, PDF_MIME, `${slug(report.exam.title)}-results.pdf`, Buffer.from(bytes));
  }

  @Get('students/:studentId/result-report')
  @CheckAbilities({ action: 'read', subject: 'Report' })
  async studentReport(@CurrentAuth() auth: AuthContext, @Param('studentId') studentId: string) {
    const schoolId = requireSchool(auth);
    return this.results.generateStudentReport(schoolId, studentId);
  }

  @Get('students/:studentId/results.pdf')
  @CheckAbilities({ action: 'read', subject: 'Report' })
  async studentResultsPdf(
    @CurrentAuth() auth: AuthContext,
    @Res() res: DownloadResponse,
    @Param('studentId') studentId: string,
  ): Promise<void> {
    const schoolId = requireSchool(auth);
    const report = await this.results.generateStudentReport(schoolId, studentId);
    const lines = [
      `Result history: ${report.student.fullName ?? 'Student'}`,
      report.student.admissionNo ? `Admission No: ${report.student.admissionNo}` : '',
      `Generated: ${report.generatedAt}`,
      '',
      'Date        Exam                          Score   %      Grade',
      ...report.rows.map(
        (row) =>
          `${row.date}  ${pad(row.examTitle ?? 'Exam', 28)}  ${row.score}/${row.maxScore}  ${row.percent}  ${row.grade ?? '-'}`,
      ),
    ];
    const bytes = writePdf({ title: 'Student results', lines });
    send(res, PDF_MIME, `student-${studentId}-results.pdf`, Buffer.from(bytes));
  }
}

function reportToXlsxRows(report: ResultReport): Array<Array<string | number | null>> {
  return [
    [report.exam.title],
    ['Subject', report.exam.subjectName],
    ['Class', report.classId],
    ['Generated', report.generatedAt],
    ['Students', report.summary.count],
    ['Average %', report.summary.averagePercent],
    ['Highest %', report.summary.highestPercent],
    ['Lowest %', report.summary.lowestPercent],
    ['Pass rate %', report.summary.passRate],
    [],
    ['#', 'Student', 'Admission No', 'Score', 'Max', 'Percent', 'Grade', 'Status'],
    ...report.rows.map((row, index) => [
      index + 1,
      row.studentName,
      row.admissionNo,
      row.score,
      row.maxScore,
      row.percent,
      row.grade,
      row.status,
    ]),
  ];
}

function reportToLines(report: ResultReport): string[] {
  return [
    report.exam.title,
    report.exam.subjectName ? `Subject: ${report.exam.subjectName}` : '',
    `Generated: ${report.generatedAt}`,
    `Students: ${report.summary.count}`,
    `Average: ${report.summary.averagePercent}%   Highest: ${report.summary.highestPercent}%   Lowest: ${report.summary.lowestPercent}%`,
    report.summary.passRate === null ? '' : `Pass rate: ${report.summary.passRate}%`,
    '',
    '#   Student                       Score    %       Grade',
    ...report.rows.map(
      (row, index) =>
        `${String(index + 1).padEnd(3)} ${pad(row.studentName ?? 'Student', 28)} ${`${row.score}/${row.maxScore}`.padEnd(8)} ${String(row.percent).padEnd(7)} ${row.grade ?? '-'}`,
    ),
  ];
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width);
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'report'
  );
}

function send(
  res: DownloadResponse,
  contentType: string,
  filename: string,
  body: Buffer | string,
): void {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}
