import type {
  GradeBand,
  GradeScaleRecord,
  GuardianInfo,
  NotificationRecord,
  RemarkCorrection,
  RemarkPreviewEntry,
  RemarkRunRecord,
  ResultRecord,
  SubmissionAnswerRecord,
  SubmissionRecord,
} from './types';
import type { PackAnswerValue } from '@cbt/exam-core';

type GradeScaleRow = {
  id: string;
  schoolId: string;
  name: string;
  bands: unknown;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type SubmissionRow = {
  id: string;
  schoolId: string;
  sittingId: string;
  studentId: string;
  examId: string;
  classId: string | null;
  packVersion: number;
  keyVersion: number;
  seat: string | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  submitReason: string | null;
  status: 'active' | 'voided';
  schoolScore: string | null;
  cloudScore: string | null;
  focusLostCount: number;
  extraSeconds: number;
  createdAt: Date;
  updatedAt: Date;
};

type SubmissionAnswerRow = {
  submissionId: string;
  questionId: string;
  answer: unknown;
  flagged: boolean;
  seq: number;
  answeredAt: Date | null;
  cloudMarks: string | null;
  maxMarks: string | null;
};

type ResultRow = {
  id: string;
  submissionId: string;
  schoolId: string;
  studentId: string;
  examId: string;
  subjectId: string | null;
  classId: string | null;
  score: string;
  maxScore: string;
  percent: string;
  grade: string | null;
  keyVersion: number;
  status: 'draft' | 'reviewed' | 'released' | 'withdrawn';
  revision: number;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  releasedBy: string | null;
  releasedAt: Date | null;
  withdrawnReason: string | null;
  teacherComment: string | null;
  updated: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type RemarkRunRow = {
  id: string;
  schoolId: string;
  examId: string;
  questionId: string;
  newQuestionId: string | null;
  reason: string;
  requestedBy: string;
  status: 'previewed' | 'applied' | 'cancelled';
  affected: number;
  newKeyVersion: number | null;
  correction: unknown;
  preview: unknown;
  appliedAt: Date | null;
  createdAt: Date;
};

type NotificationRow = {
  id: string;
  schoolId: string;
  userId: string | null;
  guardianId: string | null;
  studentId: string | null;
  resultId: string | null;
  channel: 'email' | 'sms' | 'whatsapp' | 'in_app';
  template: string;
  payload: unknown;
  status: 'queued' | 'sent' | 'failed';
  attempts: number;
  error: string | null;
  sentAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
};

/** Postgres `numeric` columns come back as strings; parse them to numbers. */
export function num(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapGradeScaleFromDb(row: GradeScaleRow): GradeScaleRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    name: row.name,
    bands: (row.bands ?? []) as GradeBand[],
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapSubmissionFromDb(row: SubmissionRow): SubmissionRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    sittingId: row.sittingId,
    studentId: row.studentId,
    examId: row.examId,
    classId: row.classId,
    packVersion: row.packVersion,
    keyVersion: row.keyVersion,
    seat: row.seat,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
    submitReason: row.submitReason,
    status: row.status,
    schoolScore: num(row.schoolScore),
    cloudScore: num(row.cloudScore),
    focusLostCount: row.focusLostCount,
    extraSeconds: row.extraSeconds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapSubmissionAnswerFromDb(row: SubmissionAnswerRow): SubmissionAnswerRecord {
  return {
    submissionId: row.submissionId,
    questionId: row.questionId,
    answer: (row.answer ?? null) as PackAnswerValue,
    flagged: row.flagged,
    seq: row.seq,
    answeredAt: row.answeredAt,
    cloudMarks: num(row.cloudMarks),
    maxMarks: num(row.maxMarks),
  };
}

export function mapResultFromDb(row: ResultRow): ResultRecord {
  return {
    id: row.id,
    submissionId: row.submissionId,
    schoolId: row.schoolId,
    studentId: row.studentId,
    examId: row.examId,
    subjectId: row.subjectId,
    classId: row.classId,
    score: num(row.score) ?? 0,
    maxScore: num(row.maxScore) ?? 0,
    percent: num(row.percent) ?? 0,
    grade: row.grade,
    keyVersion: row.keyVersion,
    status: row.status,
    revision: row.revision,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    releasedBy: row.releasedBy,
    releasedAt: row.releasedAt,
    withdrawnReason: row.withdrawnReason,
    teacherComment: row.teacherComment,
    updated: row.updated,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapRemarkRunFromDb(row: RemarkRunRow): RemarkRunRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    examId: row.examId,
    questionId: row.questionId,
    newQuestionId: row.newQuestionId,
    reason: row.reason,
    requestedBy: row.requestedBy,
    status: row.status,
    affected: row.affected,
    newKeyVersion: row.newKeyVersion,
    correction: (row.correction ?? null) as RemarkCorrection | null,
    preview: (row.preview ?? null) as RemarkPreviewEntry[] | null,
    appliedAt: row.appliedAt,
    createdAt: row.createdAt,
  };
}

export function mapNotificationFromDb(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    userId: row.userId,
    guardianId: row.guardianId,
    studentId: row.studentId,
    resultId: row.resultId,
    channel: row.channel,
    template: row.template,
    payload: (row.payload ?? null) as Record<string, unknown> | null,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    sentAt: row.sentAt,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

/** Minimal mapping for a guardian row used by the parent portal. */
export function mapGuardianInfoFromDb(row: {
  id: string;
  schoolId: string;
  userId: string | null;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
}): GuardianInfo {
  return {
    id: row.id,
    schoolId: row.schoolId,
    userId: row.userId,
    fullName: row.fullName,
    email: row.email,
    phoneE164: row.phoneE164,
  };
}
