/**
 * Types for the import pipeline (API spec section 7, US-5.x / US-6.x).
 *
 * A job moves `queued → parsing → parsed` (or `failed`); once the user
 * confirms, the usable rows are written and the job becomes `completed`.
 * Rows carry the raw cells, the server's interpretation and any errors.
 */

/** The kind of thing being imported, as the client names it. */
export type ImportKind = 'questions' | 'students' | 'guardians' | 'teachers';

/** Accepted file formats per kind (spec 7.3). */
export type ImportFormat = 'docx' | 'xlsx' | 'csv';

/** How the kind is stored on the job, mirroring the file format. */
export type StoredImportKind =
  | 'questions_docx'
  | 'questions_xlsx'
  | 'students'
  | 'guardians'
  | 'teachers';

export type ImportStatus =
  | 'queued'
  | 'parsing'
  | 'parsed'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ImportRowStatus = 'ok' | 'warning' | 'error' | 'skipped' | 'imported';

/** A validation error or warning on a row (spec 7.3). */
export interface RowError {
  field: string;
  code: string;
  message: string;
}

export interface ImportJobRecord {
  id: string;
  schoolId: string;
  kind: StoredImportKind;
  status: ImportStatus;
  sourceFile: string | null;
  subjectId: string | null;
  levelId: string | null;
  uploadedBy: string;
  totalRows: number;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  failureReason: string | null;
  errorSummary: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportRowRecord {
  id: string;
  jobId: string;
  rowNo: number;
  status: ImportRowStatus;
  raw: Record<string, unknown> | null;
  parsed: Record<string, unknown> | null;
  errors: RowError[];
  createdAt: string;
}

export interface CreateImportJobInput {
  schoolId: string;
  kind: StoredImportKind;
  uploadedBy: string;
  sourceFile: string | null;
  subjectId?: string | null;
  levelId?: string | null;
}

export interface ImportJobPatch {
  status?: ImportStatus;
  failureReason?: string | null;
  totalRows?: number;
  processedRows?: number;
  succeededRows?: number;
  failedRows?: number;
  errorSummary?: Record<string, unknown> | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

/** A row as produced by the parser, before it is persisted. */
export interface ParsedRowInput {
  rowNo: number;
  status: ImportRowStatus;
  raw: Record<string, unknown> | null;
  parsed: Record<string, unknown> | null;
  errors: RowError[];
}

export interface ImportRowPatch {
  status?: ImportRowStatus;
  raw?: Record<string, unknown> | null;
  parsed?: Record<string, unknown> | null;
  errors?: RowError[];
}

/** Reference data the validators need, loaded once per job. */
export interface ImportReferenceData {
  /** Existing approved/draft question stems, for duplicate detection. */
  questionStems: string[];
  /** Subject name (lower case) → id. */
  subjectsByName: Map<string, string>;
  /** Level name (lower case) → id. */
  levelsByName: Map<string, string>;
  /** Class name (lower case) → id. */
  classesByName: Map<string, string>;
  /** Existing admission numbers, lower case. */
  admissionNos: string[];
  /** Existing guardian phone (digits) → display name. */
  guardiansByPhone: Map<string, string>;
  /** Existing user emails, lower case. */
  userEmails: string[];
}

/** Upload-screen defaults applied when a question row leaves subject/level blank. */
export interface ImportDefaults {
  subjectId: string | null;
  levelId: string | null;
}

export const EMPTY_REFERENCE_DATA: ImportReferenceData = {
  questionStems: [],
  subjectsByName: new Map(),
  levelsByName: new Map(),
  classesByName: new Map(),
  admissionNos: [],
  guardiansByPhone: new Map(),
  userEmails: [],
};
