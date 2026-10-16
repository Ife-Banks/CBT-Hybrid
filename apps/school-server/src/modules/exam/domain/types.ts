import type { PackAnswerValue, PackQuestion } from '@cbt/exam-core';

/**
 * Domain records for the school-server exam delivery module
 * (CBT-Database-Architecture section 4.2). Timestamps are ISO-8601 strings, as
 * the school schema stores them.
 */

export type ExamSection = 'primary' | 'secondary' | 'mixed';
export type SittingStatus = 'scheduled' | 'open' | 'closed';
export type SessionStatus = 'in_progress' | 'submitted' | 'expired' | 'reset';
export type SubmitReason = 'student' | 'time_up' | 'invigilator' | 'window_closed';

export interface ClassRecord {
  id: string;
  name: string;
  section: string;
}

export interface SubjectRecord {
  id: string;
  name: string;
  code: string | null;
}

export interface StudentRecord {
  id: string;
  code: string;
  codeStatus: 'active' | 'revoked';
  fullName: string;
  classId: string | null;
  section: string;
  photoPath: string | null;
}

/** Exam settings copied from the pack manifest. */
export interface ExamSettings {
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_score_to_student: boolean;
  instructions_html: string;
  pass_mark?: number | null;
}

export interface ExamRecord {
  id: string;
  title: string;
  subjectId: string | null;
  durationMin: number;
  settings: ExamSettings;
}

export interface PackRecord {
  id: string;
  examId: string;
  version: number;
  keyVersion: number;
  dirPath: string;
  sha256: string;
  verified: boolean;
  questionCount: number | null;
  totalMarks: number | null;
  downloadedAt: string;
}

export interface SittingRecord {
  id: string;
  examId: string;
  classId: string;
  packId: string;
  windowStart: string;
  windowEnd: string;
  extraTimeMin: number;
  examKeyHash: string | null;
  status: SittingStatus;
  openedAt: string | null;
  closedAt: string | null;
}

export interface SeatRecord {
  code: string;
  label: string | null;
  lastSeenAt: string | null;
  lastIp: string | null;
}

export interface SessionRecord {
  id: string;
  sittingId: string;
  studentId: string;
  seat: string | null;
  tokenHash: string;
  seed: number;
  startedAt: string;
  endsAt: string;
  status: SessionStatus;
  submittedAt: string | null;
  submitReason: SubmitReason | null;
  lastSeq: number;
  focusLostCount: number;
  lastSeenAt: string | null;
  lastIp: string | null;
}

/** What is stored in `answers.answer_json`: the answer plus the student's flag. */
export interface StoredAnswer {
  answer: PackAnswerValue;
  flagged: boolean;
}

export interface AnswerRecord {
  sessionId: string;
  questionId: string;
  answer: PackAnswerValue;
  flagged: boolean;
  seq: number;
  savedAt: string;
}

/** One entry of an autosave batch (API spec 16.6). */
export interface AnswerChange {
  questionId: string;
  answer: PackAnswerValue;
  flagged: boolean;
}

export interface ResultRecord {
  sessionId: string;
  score: number;
  maxScore: number;
  percent: number;
  grade: string | null;
  scoredAt: string;
}

export interface OutboxEventRecord {
  eventId: string;
  type: string;
  payload: unknown;
  createdAt: string;
}

/** Everything the login step needs about a student, their class and exam. */
export interface LoginContext {
  student: StudentRecord;
  className: string | null;
  sitting: SittingRecord;
  exam: ExamRecord;
  subjectName: string | null;
  pack: PackRecord;
}

/** A question as delivered to the client, in session order. */
export type SessionQuestion = PackQuestion;
