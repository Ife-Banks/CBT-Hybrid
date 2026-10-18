import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AbilityFactory } from '../auth/abilities/ability.factory';
import { ImportsService } from './imports.service';
import { InMemoryImportRepository } from './imports.repository';
import type { ImportReferenceData } from './domain/types';

const SCHOOL = 'school-1';

function reference(): ImportReferenceData {
  return {
    questionStems: [],
    subjectsByName: new Map([['mathematics', 'sub-1']]),
    levelsByName: new Map([['jss2', 'lvl-1']]),
    classesByName: new Map(),
    admissionNos: [],
    guardiansByPhone: new Map(),
    userEmails: [],
  };
}

const QUESTION_CSV = [
  'subject,level,topic,type,question,option_a,option_b,option_c,correct,marks,difficulty',
  'Mathematics,JSS2,Indices,single_choice,What is 2^3?,6,8,9,B,1,easy',
  'Mathematics,JSS2,Indices,single_choice,Broken row,6,8,9,D,1,easy',
].join('\r\n');

describe('ImportsService', () => {
  let repository: InMemoryImportRepository;
  let service: ImportsService;

  beforeEach(() => {
    repository = new InMemoryImportRepository();
    repository.seedReference(reference());
    service = new ImportsService(repository, new AbilityFactory());
  });

  it('parses an uploaded CSV into rows and stores the job', async () => {
    const { id, status } = await service.createJob({
      schoolId: SCHOOL,
      role: 'school_admin',
      uploadedBy: 'user-1',
      kind: 'questions',
      format: 'csv',
      file: { originalName: 'questions.csv', buffer: Buffer.from(QUESTION_CSV, 'utf8') },
    });
    expect(status).toBe('queued');

    const job = await service.getJob(SCHOOL, id);
    expect(job.status).toBe('parsed');
    expect(job.total_rows).toBe(2);
    expect(job.counts.ok).toBe(1);
    expect(job.counts.error).toBe(1);

    const page = await service.listRows(SCHOOL, id, {});
    expect(page.rows[0]!.parsed).toMatchObject({ stem: 'What is 2^3?' });
    expect(page.rows[1]!.errors[0]!.code).toBe('ANSWER_MATCHES_NO_OPTION');
  });

  it('lets a bad row be fixed and then confirmed', async () => {
    const { id } = await service.createJob({
      schoolId: SCHOOL,
      role: 'school_admin',
      uploadedBy: 'user-1',
      kind: 'questions',
      format: 'csv',
      file: { originalName: 'questions.csv', buffer: Buffer.from(QUESTION_CSV, 'utf8') },
    });

    const page = await service.listRows(SCHOOL, id, { status: 'error' });
    const fixed = await service.fixRow(SCHOOL, id, page.rows[0]!.id, { correct: 'B' });
    expect(fixed.status).toBe('ok');

    const result = await service.confirm(SCHOOL, id, 'user-1');
    expect(result.created).toBe(2);
    expect(result.report_url).toBe(`/imports/${id}/report.csv`);
    expect(repository.created.questions).toBe(2);
  });

  it('skips a row so it is not imported', async () => {
    const { id } = await service.createJob({
      schoolId: SCHOOL,
      role: 'school_admin',
      uploadedBy: 'user-1',
      kind: 'questions',
      format: 'csv',
      file: { originalName: 'questions.csv', buffer: Buffer.from(QUESTION_CSV, 'utf8') },
    });

    const page = await service.listRows(SCHOOL, id, {});
    const badRow = page.rows.find((row) => row.status === 'error')!;
    await service.skipRow(SCHOOL, id, badRow.id);

    const result = await service.confirm(SCHOOL, id, 'user-1');
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('rejects a second confirm', async () => {
    const { id } = await service.createJob({
      schoolId: SCHOOL,
      role: 'school_admin',
      uploadedBy: 'user-1',
      kind: 'questions',
      format: 'csv',
      file: { originalName: 'questions.csv', buffer: Buffer.from(QUESTION_CSV, 'utf8') },
    });
    await service.confirm(SCHOOL, id, 'user-1');
    await expect(service.confirm(SCHOOL, id, 'user-1')).rejects.toThrow();
  });

  it('cancels a job', async () => {
    const { id } = await service.createJob({
      schoolId: SCHOOL,
      role: 'school_admin',
      uploadedBy: 'user-1',
      kind: 'questions',
      format: 'csv',
      file: { originalName: 'questions.csv', buffer: Buffer.from(QUESTION_CSV, 'utf8') },
    });
    await service.cancel(SCHOOL, id);
    await expect(service.getJob(SCHOOL, id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a student import by a teacher', async () => {
    await expect(
      service.createJob({
        schoolId: SCHOOL,
        role: 'teacher',
        uploadedBy: 'user-2',
        kind: 'students',
        format: 'csv',
        file: { originalName: 'students.csv', buffer: Buffer.from('admission_no,first_name,last_name\n', 'utf8') },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a file whose extension does not match the format', async () => {
    await expect(
      service.createJob({
        schoolId: SCHOOL,
        role: 'school_admin',
        uploadedBy: 'user-1',
        kind: 'questions',
        format: 'csv',
        file: { originalName: 'questions.xlsx', buffer: Buffer.from('x', 'utf8') },
      }),
    ).rejects.toThrow();
  });

  it('builds a downloadable template', () => {
    const template = service.getTemplate('students', 'csv');
    expect(template.filename).toBe('students-template.csv');
    expect(template.body.toString('utf8')).toContain('admission_no');

    expect(() => service.getTemplate('students', 'docx')).toThrow();
  });

  it('records a failed job when the file cannot be read', async () => {
    const { id } = await service.createJob({
      schoolId: SCHOOL,
      role: 'school_admin',
      uploadedBy: 'user-1',
      kind: 'questions',
      format: 'docx',
      file: { originalName: 'questions.docx', buffer: Buffer.from('not a zip', 'utf8') },
    });
    const job = await service.getJob(SCHOOL, id);
    expect(job.status).toBe('failed');
    expect(job.failure_reason).toBeTruthy();
  });
});
