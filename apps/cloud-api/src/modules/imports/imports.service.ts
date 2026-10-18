import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Role, Subject } from '@cbt/shared-types';
import { AbilityFactory } from '../auth/abilities/ability.factory';
import {
  ImportFileError,
  docxQuestionsToRecords,
  parseCsv,
  parseDocxParagraphs,
  parseXlsx,
  toTable,
} from './domain/formats';
import { parseRows } from './domain/rows';
import { buildTemplate, type TemplateFile } from './domain/template-files';
import { IMPORT_FORMATS, storedKind } from './domain/templates';
import type {
  ImportFormat,
  ImportJobRecord,
  ImportKind,
  ImportRowRecord,
  ImportRowStatus,
  StoredImportKind,
} from './domain/types';
import { IMPORT_REPOSITORY, type ImportRepository } from './imports.repository';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS: Record<ImportKind, number> = {
  questions: 200,
  students: 5000,
  guardians: 5000,
  teachers: 5000,
};

const SUBJECT_FOR_KIND: Record<ImportKind, Subject> = {
  questions: 'Question',
  students: 'Student',
  guardians: 'Guardian',
  teachers: 'Teacher',
};

export interface UploadedImportFile {
  originalName: string;
  buffer: Buffer;
}

export interface ImportJobView {
  id: string;
  kind: StoredImportKind;
  status: ImportJobRecord['status'];
  source_file: string | null;
  total_rows: number;
  processed_rows: number;
  succeeded_rows: number;
  failed_rows: number;
  counts: Record<ImportRowStatus, number>;
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface RowPageView {
  job: ImportJobView;
  rows: ImportRowRecord[];
  next_cursor: number | null;
}

export interface ConfirmResult {
  created: number;
  skipped: number;
  fixed: number;
  report_url: string;
}

/**
 * The import pipeline (API spec section 7): templates, upload, parse, row
 * preview/fix/skip, confirm and report. Jobs are school-scoped and the caller
 * must hold `import` on the subject for the kind being imported.
 */
@Injectable()
export class ImportsService {
  constructor(
    @Inject(IMPORT_REPOSITORY) private readonly repository: ImportRepository,
    private readonly abilities: AbilityFactory,
  ) {}

  getTemplate(kind: ImportKind, format: ImportFormat): TemplateFile {
    if (!IMPORT_FORMATS[kind].includes(format)) {
      throw new BadRequestException({
        code: 'IMPORT_FILE_REJECTED',
        message: `A ${kind} import cannot be a .${format} file.`,
      });
    }
    return buildTemplate(kind, format);
  }

  async createJob(input: {
    schoolId: string;
    role: Role;
    uploadedBy: string;
    kind: ImportKind;
    format: ImportFormat;
    file: UploadedImportFile;
    subjectId?: string | null;
    levelId?: string | null;
  }): Promise<{ id: string; status: 'queued' }> {
    this.assertCanImport(input.role, input.schoolId, input.kind);
    ensureFormat(input.kind, input.format, input.file.originalName);
    ensureWithinLimits(input.file);

    const job = await this.repository.createJob({
      schoolId: input.schoolId,
      kind: storedKind(input.kind, input.format) as StoredImportKind,
      uploadedBy: input.uploadedBy,
      sourceFile: input.file.originalName,
      subjectId: input.subjectId ?? null,
      levelId: input.levelId ?? null,
    });

    await this.parseJob(job, input.kind, input.format, input.file.buffer);
    return { id: job.id, status: 'queued' };
  }

  async listJobs(
    schoolId: string,
    role: Role,
    filter: { kind?: ImportKind; mine?: string },
  ): Promise<{ jobs: ImportJobView[] }> {
    if (filter.kind) this.assertCanImport(role, schoolId, filter.kind);
    const jobs = await this.repository.listJobs(schoolId, {
      kind: filter.kind,
      uploadedBy: filter.mine,
    });
    const views = await Promise.all(jobs.map((job) => this.toView(job)));
    return { jobs: views };
  }

  async getJob(schoolId: string, id: string): Promise<ImportJobView> {
    return this.toView(await this.requireJob(schoolId, id));
  }

  async listRows(
    schoolId: string,
    id: string,
    filter: { status?: ImportRowStatus; cursor?: number; limit?: number },
  ): Promise<RowPageView> {
    const job = await this.requireJob(schoolId, id);
    const page = await this.repository.listRows(id, filter);
    return {
      job: await this.toView(job),
      rows: page.items,
      next_cursor: page.nextCursor,
    };
  }

  async fixRow(
    schoolId: string,
    id: string,
    rowId: string,
    parsed: Record<string, unknown>,
  ): Promise<ImportRowRecord> {
    const job = await this.requireJob(schoolId, id);
    const row = await this.repository.getRow(id, rowId);
    if (!row) throw notFound('Row', rowId);

    const kind = jobKind(job.kind);
    const reference = await this.repository.loadReferenceData(schoolId);
    const mergedRaw = { ...(row.raw ?? {}), ...parsed } as Record<string, string>;
    const [validated] = parseRows(kind, [mergedRaw], reference, {
      subjectId: job.subjectId,
      levelId: job.levelId,
    });
    const updated = await this.repository.updateRow(id, rowId, {
      status: validated!.status,
      parsed: validated!.parsed,
      errors: validated!.errors,
      raw: mergedRaw,
    });
    return updated ?? row;
  }

  async skipRow(schoolId: string, id: string, rowId: string): Promise<ImportRowRecord> {
    await this.requireJob(schoolId, id);
    const row = await this.repository.getRow(id, rowId);
    if (!row) throw notFound('Row', rowId);
    const updated = await this.repository.updateRow(id, rowId, { status: 'skipped' });
    return updated ?? row;
  }

  async confirm(schoolId: string, id: string, actorId: string): Promise<ConfirmResult> {
    const job = await this.requireJob(schoolId, id);
    if (job.status === 'completed') {
      throw new ConflictException({
        code: 'IMPORT_ALREADY_CONFIRMED',
        message: 'This import has already been confirmed.',
      });
    }

    const kind = jobKind(job.kind);
    const all = await this.repository.listRows(id, { limit: 100000 });
    const importable = all.items.filter((row) => row.status === 'ok' || row.status === 'warning');
    const skipped = all.items.length - importable.length;

    let created = 0;
    if (kind === 'questions') {
      created = await this.repository.createQuestions(schoolId, importable, {
        subjectId: job.subjectId,
        levelId: job.levelId,
        createdBy: actorId,
      });
    } else if (kind === 'students') {
      created = await this.repository.createStudents(schoolId, importable);
    } else if (kind === 'guardians') {
      created = await this.repository.createGuardians(schoolId, importable);
    } else {
      created = await this.repository.createTeachers(schoolId, importable);
    }

    for (const row of importable) {
      await this.repository.updateRow(id, row.id, { status: 'imported' });
    }

    await this.repository.updateJob(id, {
      status: 'completed',
      succeededRows: created,
      failedRows: skipped,
      processedRows: all.items.length,
      completedAt: new Date(),
    });

    return { created, skipped, fixed: 0, report_url: `/imports/${id}/report.csv` };
  }

  async cancel(schoolId: string, id: string): Promise<void> {
    await this.requireJob(schoolId, id);
    await this.repository.deleteJob(id);
  }

  async report(schoolId: string, id: string): Promise<TemplateFile> {
    await this.requireJob(schoolId, id);
    const all = await this.repository.listRows(id, { limit: 100000 });
    const lines = ['row_no,status,errors'];
    for (const row of all.items) {
      const errors = row.errors.map((error) => `${error.field}:${error.code}`).join('; ');
      lines.push(`${row.rowNo},${row.status},${csvCell(errors)}`);
    }
    return {
      filename: `import-${id}-report.csv`,
      contentType: 'text/csv',
      body: Buffer.from(lines.join('\r\n') + '\r\n', 'utf8'),
    };
  }

  // --- internals ----------------------------------------------------------

  private async parseJob(
    job: ImportJobRecord,
    kind: ImportKind,
    format: ImportFormat,
    buffer: Buffer,
  ): Promise<void> {
    await this.repository.updateJob(job.id, { status: 'parsing', startedAt: new Date() });
    try {
      const rawRows = rowsFromFile(kind, format, buffer);
      if (rawRows.length > MAX_ROWS[kind]) {
        throw new ImportFileError(
          'IMPORT_FILE_REJECTED',
          `At most ${MAX_ROWS[kind]} rows are allowed (got ${rawRows.length}).`,
        );
      }
      const reference = await this.repository.loadReferenceData(job.schoolId);
      const rows = parseRows(kind, rawRows, reference, {
        subjectId: job.subjectId,
        levelId: job.levelId,
      });
      await this.repository.insertRows(job.id, rows);
      await this.repository.updateJob(job.id, {
        status: 'parsed',
        totalRows: rows.length,
        processedRows: rows.length,
        succeededRows: rows.filter((row) => row.status === 'ok' || row.status === 'warning').length,
        failedRows: rows.filter((row) => row.status === 'error').length,
        completedAt: new Date(),
      });
    } catch (error) {
      await this.repository.updateJob(job.id, {
        status: 'failed',
        failureReason: error instanceof Error ? error.message : 'Parsing failed.',
        completedAt: new Date(),
      });
    }
  }

  private async requireJob(schoolId: string, id: string): Promise<ImportJobRecord> {
    const job = await this.repository.getJob(id);
    if (!job || job.schoolId !== schoolId) throw notFound('Import', id);
    return job;
  }

  private async toView(job: ImportJobRecord): Promise<ImportJobView> {
    const counts = await this.repository.countRows(job.id);
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      source_file: job.sourceFile,
      total_rows: job.totalRows,
      processed_rows: job.processedRows,
      succeeded_rows: job.succeededRows,
      failed_rows: job.failedRows,
      counts,
      failure_reason: job.failureReason,
      created_at: job.createdAt,
      completed_at: job.completedAt,
    };
  }

  private assertCanImport(role: Role, schoolId: string | null, kind: ImportKind): void {
    const ability = this.abilities.createForUser({ role, schoolId });
    if (!ability.can('import', SUBJECT_FOR_KIND[kind])) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Requires import on ${SUBJECT_FOR_KIND[kind]}`,
      });
    }
  }
}

function jobKind(stored: StoredImportKind): ImportKind {
  if (stored === 'questions_docx' || stored === 'questions_xlsx') return 'questions';
  return stored;
}

function rowsFromFile(
  kind: ImportKind,
  format: ImportFormat,
  buffer: Buffer,
): Array<Record<string, string>> {
  const bytes = new Uint8Array(buffer);
  if (format === 'docx') {
    if (kind !== 'questions') {
      throw new ImportFileError('IMPORT_FILE_REJECTED', 'Only questions may be a Word file.');
    }
    return docxQuestionsToRecords(parseDocxParagraphs(bytes));
  }
  if (format === 'xlsx') {
    return toTable(parseXlsx(bytes)).rows;
  }
  return toTable(parseCsv(buffer.toString('utf8'))).rows;
}

function ensureFormat(kind: ImportKind, format: ImportFormat, originalName: string): void {
  const extension = originalName.split('.').pop()?.toLowerCase() ?? '';
  if (!IMPORT_FORMATS[kind].includes(format)) {
    throw new BadRequestException({
      code: 'IMPORT_FILE_REJECTED',
      message: `A ${kind} import cannot be a .${format} file.`,
    });
  }
  if (extension !== format) {
    throw new BadRequestException({
      code: 'IMPORT_FILE_REJECTED',
      message: `The file must have a .${format} extension.`,
    });
  }
}

function ensureWithinLimits(file: UploadedImportFile): void {
  if (file.buffer.byteLength > MAX_BYTES) {
    throw new BadRequestException({
      code: 'IMPORT_FILE_REJECTED',
      message: 'The file is larger than 10 MB.',
    });
  }
  if (file.buffer.includes('vbaProject.bin')) {
    throw new BadRequestException({
      code: 'IMPORT_FILE_REJECTED',
      message: 'Macro-enabled files are not accepted.',
    });
  }
}

function notFound(entity: string, id: string): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', message: `${entity} ${id} not found` });
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
