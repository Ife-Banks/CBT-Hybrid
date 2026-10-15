import type { SubjectRecord, Level, Question, QuestionOption } from '@cbt/shared-types';

// Domain records for questions
export interface SubjectDomainRecord {
  id: string;
  schoolId: string;
  name: string;
  code?: string;
  section?: 'primary' | 'secondary' | 'both';
  createdAt: Date;
}

export interface LevelDomainRecord {
  id: string;
  schoolId: string;
  name: string;
  section?: 'nursery' | 'primary' | 'secondary';
  sortOrder: number;
  createdAt: Date;
}

export interface QuestionDomainRecord {
  id: string;
  schoolId: string;
  subjectId: string;
  levelId?: string;
  type: 'single_choice' | 'multi_choice' | 'true_false' | 'fill_blank' | 'essay' | 'matching' | 'ordering';
  stem: string;
  explanation?: string;
  marks: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  topic?: string;
  tags: string[];
  fillAnswers?: Record<string, unknown>;
  matchingPairs?: Array<{ left: string; right: string }>;
  correctOrder?: string[];
  status: 'draft' | 'approved' | 'retired';
  supersedesId?: string;
  version: number;
  usageCount: number;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  importRowId?: string;
}

export interface QuestionOptionDomainRecord {
  id: string;
  questionId: string;
  label: string;
  body: string;
  isCorrect: boolean;
  sortOrder: number;
  assetId?: string;
}

// Input DTOs
export interface CreateSubjectDto {
  name: string;
  code?: string;
  section?: 'primary' | 'secondary' | 'both';
}

export interface UpdateSubjectDto {
  name?: string;
  code?: string;
  section?: 'primary' | 'secondary' | 'both';
}

export interface CreateLevelDto {
  name: string;
  section?: 'nursery' | 'primary' | 'secondary';
  sortOrder: number;
}

export interface UpdateLevelDto {
  name?: string;
  section?: 'nursery' | 'primary' | 'secondary';
  sortOrder?: number;
}

export interface CreateQuestionDto {
  subjectId: string;
  levelId?: string;
  type: 'single_choice' | 'multi_choice' | 'true_false' | 'fill_blank' | 'essay' | 'matching' | 'ordering';
  stem: string;
  explanation?: string;
  marks: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  topic?: string;
  tags?: string[];
  fillAnswers?: Record<string, unknown>;
  matchingPairs?: Array<{ left: string; right: string }>;
  correctOrder?: string[];
  options?: CreateQuestionOptionDto[];
}

export interface UpdateQuestionDto {
  subjectId?: string;
  levelId?: string;
  stem?: string;
  explanation?: string;
  marks?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  topic?: string;
  tags?: string[];
  fillAnswers?: Record<string, unknown>;
  matchingPairs?: Array<{ left: string; right: string }>;
  correctOrder?: string[];
  status?: 'draft' | 'approved' | 'retired';
}

// Phase 5B: Asset types
export interface AssetDomainRecord {
  id: string;
  schoolId: string;
  type: 'image' | 'audio' | 'video' | 'document';
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  storageProvider: string;
  uploadedBy?: string;
  createdAt: Date;
}

export interface CreateAssetDto {
  type: 'image' | 'audio' | 'video' | 'document';
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  storageProvider?: string;
}

export interface UpdateAssetDto {
  filename?: string;
  storagePath?: string;
}

export interface QuestionAssetDomainRecord {
  questionId: string;
  assetId: string;
  assetRole: string;
  createdAt: Date;
}

export interface CreateQuestionAssetDto {
  questionId: string;
  assetId: string;
  assetRole?: string;
}

export interface ImportJobDomainRecord {
  id: string;
  schoolId: string;
  kind: 'word' | 'excel' | 'csv' | 'json';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  fileAssetId?: string;
  uploadedBy: string;
  totalRows: number;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  errorSummary?: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateImportJobDto {
  kind: 'word' | 'excel' | 'csv' | 'json';
  fileAssetId: string;
}

export interface UpdateImportJobDto {
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalRows?: number;
  processedRows?: number;
  succeededRows?: number;
  failedRows?: number;
  errorSummary?: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
}

// Phase 5B: Bulk operations
export interface BulkCreateQuestionsDto {
  questions: CreateQuestionDto[];
}

export interface BulkUpdateQuestionsDto {
  questionIds: string[];
  updates: UpdateQuestionDto;
}

export interface BulkApproveQuestionsDto {
  questionIds: string[];
  approvedBy: string;
}

export interface BulkRetireQuestionsDto {
  questionIds: string[];
}

export interface BulkTagQuestionsDto {
  questionIds: string[];
  tags: string[];
  operation: 'add' | 'remove' | 'replace';
}

export interface CreateQuestionOptionDto {
  label: string;
  body: string;
  isCorrect: boolean;
  sortOrder: number;
  assetId?: string;
}

export interface UpdateQuestionOptionDto {
  label?: string;
  body?: string;
  isCorrect?: boolean;
  sortOrder?: number;
  assetId?: string;
}

// Search/filter DTOs
export interface QuestionFilterDto {
  subjectId?: string;
  levelId?: string;
  type?: string;
  difficulty?: string;
  topic?: string;
  tags?: string[];
  status?: string;
  createdBy?: string;
  search?: string;
}

export interface QuestionSearchParams {
  schoolId: string;
  filter: QuestionFilterDto;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'marks' | 'usageCount';
  sortOrder?: 'asc' | 'desc';
}
