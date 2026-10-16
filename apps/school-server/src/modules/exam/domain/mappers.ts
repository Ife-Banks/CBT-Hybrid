import type { examSessions, answers, results, sittings, students, exams, packs, seats } from '../../../shared/database/schema';
import type {
  AnswerRecord,
  ExamRecord,
  ExamSettings,
  PackRecord,
  ResultRecord,
  SeatRecord,
  SessionRecord,
  SittingRecord,
  StoredAnswer,
  StudentRecord,
} from './types';

type StudentRow = typeof students.$inferSelect;
type ExamRow = typeof exams.$inferSelect;
type PackRow = typeof packs.$inferSelect;
type SittingRow = typeof sittings.$inferSelect;
type SessionRow = typeof examSessions.$inferSelect;
type AnswerRow = typeof answers.$inferSelect;
type ResultRow = typeof results.$inferSelect;
type SeatRow = typeof seats.$inferSelect;

/** Default exam settings when a pack manifest omits them. */
export const DEFAULT_EXAM_SETTINGS: ExamSettings = {
  shuffle_questions: true,
  shuffle_options: true,
  show_score_to_student: false,
  instructions_html: '',
  pass_mark: null,
};

/** Parse the `settings_json` column, filling in defaults. */
export function parseExamSettings(json: string | null): ExamSettings {
  if (!json) return { ...DEFAULT_EXAM_SETTINGS };
  try {
    const parsed = JSON.parse(json) as Partial<ExamSettings>;
    return { ...DEFAULT_EXAM_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_EXAM_SETTINGS };
  }
}

export function toStudentRecord(row: StudentRow): StudentRecord {
  return {
    id: row.id,
    code: row.code,
    codeStatus: row.codeStatus === 'revoked' ? 'revoked' : 'active',
    fullName: row.fullName,
    classId: row.classId,
    section: row.section,
    photoPath: row.photoPath,
  };
}

export function toExamRecord(row: ExamRow): ExamRecord {
  return {
    id: row.id,
    title: row.title,
    subjectId: row.subjectId,
    durationMin: row.durationMin,
    settings: parseExamSettings(row.settingsJson),
  };
}

export function toPackRecord(row: PackRow): PackRecord {
  return {
    id: row.id,
    examId: row.examId,
    version: row.version,
    keyVersion: row.keyVersion,
    dirPath: row.dirPath,
    sha256: row.sha256,
    verified: row.verified,
    questionCount: row.questionCount,
    totalMarks: row.totalMarks,
    downloadedAt: row.downloadedAt,
  };
}

export function toSittingRecord(row: SittingRow): SittingRecord {
  return {
    id: row.id,
    examId: row.examId,
    classId: row.classId,
    packId: row.packId,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    extraTimeMin: row.extraTimeMin,
    examKeyHash: row.examKeyHash,
    status: row.status as SittingRecord['status'],
    openedAt: row.openedAt,
    closedAt: row.closedAt,
  };
}

export function toSessionRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    sittingId: row.sittingId,
    studentId: row.studentId,
    seat: row.seat,
    tokenHash: row.tokenHash,
    seed: row.seed,
    startedAt: row.startedAt,
    endsAt: row.endsAt,
    status: row.status as SessionRecord['status'],
    submittedAt: row.submittedAt,
    submitReason: (row.submitReason as SessionRecord['submitReason']) ?? null,
    lastSeq: row.lastSeq,
    focusLostCount: row.focusLostCount,
    lastSeenAt: row.lastSeenAt,
    lastIp: row.lastIp,
  };
}

/** Read the `{ answer, flagged }` envelope stored in `answer_json`. */
export function parseStoredAnswer(json: string): StoredAnswer {
  try {
    const parsed = JSON.parse(json) as StoredAnswer;
    return { answer: parsed.answer ?? null, flagged: parsed.flagged ?? false };
  } catch {
    return { answer: null, flagged: false };
  }
}

export function toAnswerRecord(row: AnswerRow): AnswerRecord {
  const stored = parseStoredAnswer(row.answerJson);
  return {
    sessionId: row.sessionId,
    questionId: row.questionId,
    answer: stored.answer,
    flagged: stored.flagged,
    seq: row.seq,
    savedAt: row.savedAt,
  };
}

export function toResultRecord(row: ResultRow): ResultRecord {
  return {
    sessionId: row.sessionId,
    score: row.score,
    maxScore: row.maxScore,
    percent: row.percent,
    grade: row.grade,
    scoredAt: row.scoredAt,
  };
}

export function toSeatRecord(row: SeatRow): SeatRecord {
  return {
    code: row.code,
    label: row.label,
    lastSeenAt: row.lastSeenAt,
    lastIp: row.lastIp,
  };
}
