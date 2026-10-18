import { Injectable } from '@nestjs/common';
import type {
  CreateImportJobInput,
  ImportJobPatch,
  ImportJobRecord,
  ImportKind,
  ImportReferenceData,
  ImportRowPatch,
  ImportRowRecord,
  ImportRowStatus,
  ParsedRowInput,
} from './domain/types';
import { EMPTY_REFERENCE_DATA } from './domain/types';

/** Injection token for {@link ImportRepository}. */
export const IMPORT_REPOSITORY = Symbol('IMPORT_REPOSITORY');

export interface RowPage {
  items: ImportRowRecord[];
  nextCursor: number | null;
}

/**
 * Persistence port for the import pipeline (API spec section 7). Jobs and
 * their parsed rows live together; the same port also exposes the reference
 * data the validators need and the write methods used on confirm.
 */
export interface ImportRepository {
  createJob(input: CreateImportJobInput): Promise<ImportJobRecord>;
  updateJob(id: string, patch: ImportJobPatch): Promise<ImportJobRecord | null>;
  getJob(id: string): Promise<ImportJobRecord | null>;
  listJobs(schoolId: string, filter: { kind?: ImportKind; uploadedBy?: string }): Promise<ImportJobRecord[]>;
  deleteJob(id: string): Promise<void>;

  insertRows(jobId: string, rows: ParsedRowInput[]): Promise<void>;
  listRows(
    jobId: string,
    filter: { status?: ImportRowStatus; cursor?: number; limit?: number },
  ): Promise<RowPage>;
  getRow(jobId: string, rowId: string): Promise<ImportRowRecord | null>;
  updateRow(jobId: string, rowId: string, patch: ImportRowPatch): Promise<ImportRowRecord | null>;
  countRows(jobId: string): Promise<Record<ImportRowStatus, number>>;

  /** Reference data for validation (classes, existing stems, etc.). */
  loadReferenceData(schoolId: string): Promise<ImportReferenceData>;

  createQuestions(
    schoolId: string,
    rows: ImportRowRecord[],
    context: { subjectId: string | null; levelId: string | null; createdBy: string },
  ): Promise<number>;
  createStudents(schoolId: string, rows: ImportRowRecord[]): Promise<number>;
  createGuardians(schoolId: string, rows: ImportRowRecord[]): Promise<number>;
  createTeachers(schoolId: string, rows: ImportRowRecord[]): Promise<number>;
}

function emptyCounts(): Record<ImportRowStatus, number> {
  return { ok: 0, warning: 0, error: 0, skipped: 0, imported: 0 };
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence.toString().padStart(6, '0')}`;
}

/** In-memory store for tests and local runs (no `DATABASE_URL`). */
@Injectable()
export class InMemoryImportRepository implements ImportRepository {
  private readonly jobs = new Map<string, ImportJobRecord>();
  private readonly rows = new Map<string, ImportRowRecord[]>();
  private reference: ImportReferenceData = EMPTY_REFERENCE_DATA;
  /** Records written on confirm, keyed by kind — surfaced for assertions. */
  readonly created: Record<ImportKind, number> = {
    questions: 0,
    students: 0,
    guardians: 0,
    teachers: 0,
  };

  seedReference(reference: ImportReferenceData): void {
    this.reference = reference;
  }

  async createJob(input: CreateImportJobInput): Promise<ImportJobRecord> {
    const now = new Date().toISOString();
    const job: ImportJobRecord = {
      id: nextId('job'),
      schoolId: input.schoolId,
      kind: input.kind,
      status: 'queued',
      sourceFile: input.sourceFile,
      subjectId: input.subjectId ?? null,
      levelId: input.levelId ?? null,
      uploadedBy: input.uploadedBy,
      totalRows: 0,
      processedRows: 0,
      succeededRows: 0,
      failedRows: 0,
      failureReason: null,
      errorSummary: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async updateJob(id: string, patch: ImportJobPatch): Promise<ImportJobRecord | null> {
    const job = this.jobs.get(id);
    if (!job) return null;
    const updated: ImportJobRecord = {
      ...job,
      ...patch,
      startedAt: patch.startedAt === undefined ? job.startedAt : toIso(patch.startedAt),
      completedAt: patch.completedAt === undefined ? job.completedAt : toIso(patch.completedAt),
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async getJob(id: string): Promise<ImportJobRecord | null> {
    return this.jobs.get(id) ?? null;
  }

  async listJobs(
    schoolId: string,
    filter: { kind?: ImportKind; uploadedBy?: string },
  ): Promise<ImportJobRecord[]> {
    return [...this.jobs.values()]
      .filter((job) => job.schoolId === schoolId)
      .filter((job) => (filter.kind ? job.kind.startsWith(filter.kind) : true))
      .filter((job) => (filter.uploadedBy ? job.uploadedBy === filter.uploadedBy : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteJob(id: string): Promise<void> {
    this.jobs.delete(id);
    this.rows.delete(id);
  }

  async insertRows(jobId: string, rows: ParsedRowInput[]): Promise<void> {
    const stored = rows.map((row) => ({
      id: nextId('row'),
      jobId,
      rowNo: row.rowNo,
      status: row.status,
      raw: row.raw,
      parsed: row.parsed,
      errors: row.errors,
      createdAt: new Date().toISOString(),
    }));
    this.rows.set(jobId, stored);
  }

  async listRows(
    jobId: string,
    filter: { status?: ImportRowStatus; cursor?: number; limit?: number },
  ): Promise<RowPage> {
    const all = (this.rows.get(jobId) ?? []).filter((row) =>
      filter.status ? row.status === filter.status : true,
    );
    const limit = filter.limit ?? 50;
    const start = filter.cursor ?? 0;
    const items = all.slice(start, start + limit);
    const nextCursor = start + limit < all.length ? start + limit : null;
    return { items, nextCursor };
  }

  async getRow(jobId: string, rowId: string): Promise<ImportRowRecord | null> {
    return (this.rows.get(jobId) ?? []).find((row) => row.id === rowId) ?? null;
  }

  async updateRow(
    jobId: string,
    rowId: string,
    patch: ImportRowPatch,
  ): Promise<ImportRowRecord | null> {
    const list = this.rows.get(jobId);
    if (!list) return null;
    const index = list.findIndex((row) => row.id === rowId);
    if (index === -1) return null;
    const updated = { ...list[index]!, ...patch };
    list[index] = updated;
    return updated;
  }

  async countRows(jobId: string): Promise<Record<ImportRowStatus, number>> {
    const counts = emptyCounts();
    for (const row of this.rows.get(jobId) ?? []) counts[row.status] += 1;
    return counts;
  }

  async loadReferenceData(schoolId: string): Promise<ImportReferenceData> {
    void schoolId;
    return this.reference;
  }

  async createQuestions(
    schoolId: string,
    rows: ImportRowRecord[],
    context: { subjectId: string | null; levelId: string | null; createdBy: string },
  ): Promise<number> {
    void schoolId;
    void context;
    const importable = rows.filter((row) => row.status !== 'error' && row.status !== 'skipped');
    this.created.questions += importable.length;
    return importable.length;
  }

  async createStudents(schoolId: string, rows: ImportRowRecord[]): Promise<number> {
    void schoolId;
    const importable = rows.filter((row) => row.status !== 'error' && row.status !== 'skipped');
    this.created.students += importable.length;
    return importable.length;
  }

  async createGuardians(schoolId: string, rows: ImportRowRecord[]): Promise<number> {
    void schoolId;
    const importable = rows.filter((row) => row.status !== 'error' && row.status !== 'skipped');
    this.created.guardians += importable.length;
    return importable.length;
  }

  async createTeachers(schoolId: string, rows: ImportRowRecord[]): Promise<number> {
    void schoolId;
    const importable = rows.filter((row) => row.status !== 'error' && row.status !== 'skipped');
    this.created.teachers += importable.length;
    return importable.length;
  }
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
