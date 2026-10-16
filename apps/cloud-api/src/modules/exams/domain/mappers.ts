import type {
  Exam,
  ExamClass,
  ExamQuestion,
  Sitting,
  ExamPack,
  Class,
} from '@cbt/shared-types';
import type {
  ExamDomainRecord,
  ClassDomainRecord,
  ExamClassDomainRecord,
  ExamQuestionDomainRecord,
  SittingDomainRecord,
  ExamPackDomainRecord,
} from './types';

// Exam mapper
export function mapExamToDomain(row: Exam): ExamDomainRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    title: row.title,
    subjectId: row.subjectId,
    kind: row.kind,
    durationMin: row.durationMin,
    shuffleQuestions: row.shuffleQuestions,
    shuffleOptions: row.shuffleOptions,
    negativeMarking: row.negativeMarking,
    showScoreToStudent: row.showScoreToStudent,
    passMarkPct: row.passMarkPct ? Number(row.passMarkPct) : undefined,
    instructions: row.instructions ?? undefined,
    status: row.status,
    frozenAt: row.frozenAt ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Class mapper
export function mapClassToDomain(row: Class): ClassDomainRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    name: row.name,
    levelName: row.levelName ?? undefined,
    section: row.section,
    createdAt: row.createdAt,
  };
}

// ExamClass mapper
export function mapExamClassToDomain(row: ExamClass): ExamClassDomainRecord {
  return {
    examId: row.examId,
    classId: row.classId,
  };
}

// ExamQuestion mapper
export function mapExamQuestionToDomain(row: ExamQuestion): ExamQuestionDomainRecord {
  return {
    examId: row.examId,
    questionId: row.questionId,
    position: row.position,
    marksOverride: row.marksOverride ? Number(row.marksOverride) : undefined,
  };
}

// Sitting mapper
export function mapSittingToDomain(row: Sitting): SittingDomainRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    examId: row.examId,
    classId: row.classId,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    extraTimeMin: row.extraTimeMin,
    status: row.status,
    examKeyHash: row.examKeyHash ?? undefined,
    openedAt: row.openedAt ?? undefined,
    closedAt: row.closedAt ?? undefined,
    closedBy: row.closedBy ?? undefined,
    createdAt: row.createdAt,
  };
}

// ExamPack mapper
export function mapExamPackToDomain(row: ExamPack): ExamPackDomainRecord {
  return {
    id: row.id,
    examId: row.examId,
    version: row.version,
    keyVersion: row.keyVersion,
    manifest: row.manifest as Record<string, unknown>,
    storageKey: row.storageKey,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    signature: row.signature,
    createdAt: row.createdAt,
  };
}
