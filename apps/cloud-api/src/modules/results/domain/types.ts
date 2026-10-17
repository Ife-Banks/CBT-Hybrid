import type { PackAnswerValue, PackQuestionKey } from '@cbt/exam-core';

/** Result lifecycle (BR-14): `draft -> reviewed -> released`, or `withdrawn`. */
export type ResultStatus = 'draft' | 'reviewed' | 'released' | 'withdrawn';

/** A submission is `active` until a `session.reset` voids it. */
export type SubmissionStatus = 'active' | 'voided';

export type NotificationChannel = 'email' | 'sms' | 'whatsapp' | 'in_app';
export type NotificationStatus = 'queued' | 'sent' | 'failed';
export type RemarkRunStatus = 'previewed' | 'applied' | 'cancelled';

/** One band of a grade scale (BR-18). */
export interface GradeBand {
  min: number;
  max: number;
  grade: string;
  remark?: string;
}

export interface GradeScaleRecord {
  id: string;
  schoolId: string;
  name: string;
  bands: GradeBand[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmissionAnswerRecord {
  submissionId: string;
  questionId: string;
  answer: PackAnswerValue;
  flagged: boolean;
  seq: number;
  answeredAt: Date | null;
  cloudMarks: number | null;
  maxMarks: number | null;
}

export interface SubmissionRecord {
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
  status: SubmissionStatus;
  schoolScore: number | null;
  cloudScore: number | null;
  focusLostCount: number;
  extraSeconds: number;
  createdAt: Date;
  updatedAt: Date;
  answers?: SubmissionAnswerRecord[];
}

export interface ResultRecord {
  id: string;
  submissionId: string;
  schoolId: string;
  studentId: string;
  examId: string;
  subjectId: string | null;
  classId: string | null;
  score: number;
  maxScore: number;
  percent: number;
  grade: string | null;
  keyVersion: number;
  status: ResultStatus;
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
}

export interface RemarkPreviewEntry {
  student_id: string;
  old_score: number;
  new_score: number;
}

/** The answer-key change a remark run would apply (API spec 9.3). */
export interface RemarkCorrection {
  correctOptionIds?: string[];
  fillAnswers?: string[];
  caseSensitive?: boolean;
}

export interface RemarkRunRecord {
  id: string;
  schoolId: string;
  examId: string;
  questionId: string;
  newQuestionId: string | null;
  reason: string;
  requestedBy: string;
  status: RemarkRunStatus;
  affected: number;
  newKeyVersion: number | null;
  correction: RemarkCorrection | null;
  preview: RemarkPreviewEntry[] | null;
  appliedAt: Date | null;
  createdAt: Date;
}

export interface NotificationRecord {
  id: string;
  schoolId: string;
  userId: string | null;
  guardianId: string | null;
  studentId: string | null;
  resultId: string | null;
  channel: NotificationChannel;
  template: string;
  payload: Record<string, unknown> | null;
  status: NotificationStatus;
  attempts: number;
  error: string | null;
  sentAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Read-model (directory) types the results, analytics and parent modules share.
// ---------------------------------------------------------------------------

export interface ExamInfo {
  id: string;
  schoolId: string;
  title: string;
  subjectId: string | null;
  subjectName: string | null;
  classIds: string[];
  passMarkPct: number | null;
  showScoreToStudent: boolean;
  createdBy: string;
}

/** A question as it appears in an exam, with its marking key resolved. */
export interface ExamQuestionKeyInfo {
  questionId: string;
  examId: string;
  position: number;
  marks: number;
  key: PackQuestionKey;
}

export interface StudentInfo {
  id: string;
  schoolId: string;
  fullName: string;
  admissionNo: string;
  photoUrl: string | null;
}

export interface ClassInfo {
  id: string;
  schoolId: string;
  name: string;
  section: string;
}

export interface GuardianshipInfo {
  guardianId: string;
  studentId: string;
  relationship: string | null;
  canViewResults: boolean;
}

export interface GuardianInfo {
  id: string;
  schoolId: string;
  userId: string | null;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
}

export interface SittingInfo {
  id: string;
  schoolId: string;
  examId: string;
  classId: string;
  status: string;
}
