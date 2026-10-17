import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { writeZip, type ZipEntry } from '@cbt/exam-core';
import { AuditService } from '../auth/audit/audit.service';
import { toCsv } from '../results/domain/csv';
import { SettingsService } from '../settings/settings.service';
import {
  STUDENT_DATA_REPOSITORY,
  type StudentDataRepository,
  type StudentDataSet,
} from './student-data.repository';

export interface StudentExportFile {
  filename: string;
  contentType: string;
  body: Buffer;
}

export interface AnonymiseResult {
  id: string;
  anonymised_at: string;
  scores_retained: boolean;
}

const ZIP_MIME = 'application/zip';

/**
 * Student data requests (API spec 5, US-16.2).
 *
 * `data-export` returns a ZIP of everything held about a student.
 * `anonymise` replaces the identity fields while keeping scores only when the
 * school's retention rule allows it (`retention.results_years_after_leaving`);
 * a rule of zero also drops the student's results and submissions. Both actions
 * are audit logged and scoped to the caller's school.
 */
@Injectable()
export class StudentDataService {
  constructor(
    @Inject(STUDENT_DATA_REPOSITORY) private readonly repository: StudentDataRepository,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async dataExport(
    schoolId: string,
    actorId: string,
    actorRole: string,
    studentId: string,
  ): Promise<StudentExportFile> {
    const data = await this.requireStudent(schoolId, studentId);
    const body = Buffer.from(writeZip(buildArchive(data)));

    this.audit.record({
      action: 'data.exported',
      outcome: 'success',
      schoolId,
      actorUserId: actorId,
      actorRole,
      targetType: 'student',
      targetId: studentId,
      detail: { name: 'student-data', format: 'zip' },
    });

    return {
      filename: `student-${data.profile.admissionNo}.zip`,
      contentType: ZIP_MIME,
      body,
    };
  }

  async anonymise(
    schoolId: string,
    actorId: string,
    actorRole: string,
    studentId: string,
  ): Promise<AnonymiseResult> {
    const data = await this.requireStudent(schoolId, studentId);
    const settings = await this.settings.get(schoolId);
    const scoresRetained = settings.retention.results_years_after_leaving > 0;
    const pseudonym = pseudonymFor(studentId);

    await this.repository.anonymise(studentId, pseudonym);
    if (!scoresRetained) {
      await this.repository.purgeScores(studentId);
    }

    this.audit.record({
      action: 'student.anonymised',
      outcome: 'success',
      schoolId,
      actorUserId: actorId,
      actorRole,
      targetType: 'student',
      targetId: studentId,
      detail: { scores_retained: scoresRetained, admission_no: data.profile.admissionNo },
    });

    return { id: studentId, anonymised_at: new Date().toISOString(), scores_retained: scoresRetained };
  }

  /** Fetch the student, 404ing when missing or owned by another school. */
  private async requireStudent(schoolId: string, studentId: string): Promise<StudentDataSet> {
    const data = await this.repository.collect(studentId);
    if (!data || data.profile.schoolId !== schoolId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `Student ${studentId} not found` });
    }
    return data;
  }
}

/** A stable pseudonym standing in for the removed admission number. */
function pseudonymFor(studentId: string): string {
  const body = studentId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
  return `ANON-${body}`;
}

function buildArchive(data: StudentDataSet): ZipEntry[] {
  const encoder = new TextEncoder();

  const resultRows: Array<Array<string | number | null>> = [
    ['Exam', 'Status', 'Score', 'Max', 'Percent', 'Grade', 'Released'],
    ...data.results.map((result) => [
      result.examTitle ?? result.examId,
      result.status,
      result.score,
      result.maxScore,
      result.percent,
      result.grade,
      result.releasedAt,
    ]),
  ];

  return [
    { path: 'README.txt', data: encoder.encode(readme(data)) },
    { path: 'guardians.json', data: encoder.encode(JSON.stringify(data.guardians, null, 2)) },
    { path: 'results.csv', data: encoder.encode(toCsv(resultRows)) },
    { path: 'student.json', data: encoder.encode(JSON.stringify(data.profile, null, 2)) },
  ];
}

function readme(data: StudentDataSet): string {
  return [
    'Student data export (API spec section 5, US-16.2)',
    '',
    `Student: ${data.profile.firstName} ${data.profile.lastName}`,
    `Admission no: ${data.profile.admissionNo}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    'Contents:',
    '  student.json   - identity and enrolment fields',
    '  guardians.json - linked guardians',
    '  results.csv    - results held for this student',
    '',
  ].join('\n');
}
