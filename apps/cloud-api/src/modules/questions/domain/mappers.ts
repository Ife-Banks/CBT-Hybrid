import type { SubjectRecord, Level, Question, QuestionOption, Asset, QuestionAsset, ImportJob } from '@cbt/shared-types';
import type {
  SubjectDomainRecord,
  LevelDomainRecord,
  QuestionDomainRecord,
  QuestionOptionDomainRecord,
  AssetDomainRecord,
  QuestionAssetDomainRecord,
  ImportJobDomainRecord,
} from './types';

export function mapSubjectFromDb(row: SubjectRecord): SubjectDomainRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    name: row.name,
    code: row.code ?? undefined,
    section: row.section ?? undefined,
    createdAt: row.createdAt,
  };
}

export function mapLevelFromDb(row: Level): LevelDomainRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    name: row.name,
    section: row.section ?? undefined,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

export function mapQuestionFromDb(row: Question): QuestionDomainRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    subjectId: row.subjectId,
    levelId: row.levelId ?? undefined,
    type: row.type,
    stem: row.stem,
    explanation: row.explanation ?? undefined,
    marks: Number(row.marks),
    difficulty: row.difficulty ?? undefined,
    topic: row.topic ?? undefined,
    tags: row.tags ?? [],
    fillAnswers: row.fillAnswers as Record<string, unknown> ?? undefined,
    matchingPairs: row.matchingPairs as Array<{ left: string; right: string }> ?? undefined,
    correctOrder: row.correctOrder as string[] ?? undefined,
    status: row.status,
    supersedesId: row.supersedesId ?? undefined,
    version: row.version,
    usageCount: row.usageCount,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy ?? undefined,
    approvedAt: row.approvedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    importRowId: row.importRowId ?? undefined,
  };
}

export function mapQuestionOptionFromDb(row: QuestionOption): QuestionOptionDomainRecord {
  return {
    id: row.id,
    questionId: row.questionId,
    label: row.label,
    body: row.body,
    isCorrect: row.isCorrect,
    sortOrder: row.sortOrder,
    assetId: row.assetId ?? undefined,
  };
}

// Phase 5B mappers
export function mapAssetFromDb(row: Asset): AssetDomainRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    type: row.type,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storagePath: row.storagePath,
    storageProvider: row.storageProvider,
    uploadedBy: row.uploadedBy ?? undefined,
    createdAt: row.createdAt,
  };
}

export function mapQuestionAssetFromDb(row: QuestionAsset): QuestionAssetDomainRecord {
  return {
    questionId: row.questionId,
    assetId: row.assetId,
    assetRole: row.assetRole,
    createdAt: row.createdAt,
  };
}

export function mapImportJobFromDb(row: ImportJob): ImportJobDomainRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    kind: row.kind,
    status: row.status,
    fileAssetId: row.fileAssetId ?? undefined,
    uploadedBy: row.uploadedBy,
    totalRows: row.totalRows ?? 0,
    processedRows: row.processedRows ?? 0,
    succeededRows: row.succeededRows ?? 0,
    failedRows: row.failedRows ?? 0,
    errorSummary: row.errorSummary as Record<string, unknown> ?? undefined,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
