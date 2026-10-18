import type {
  ExamRecord,
  ExamSettings,
  SeatRecord,
  SittingRecord,
  StudentRecord,
  SubjectRecord,
} from '../domain/types';

/** Injection token for the reference-data repository. */
export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

/** Reference data the exam API reads, and the writes pack import needs. */
export interface CatalogRepository {
  findStudentByCode(code: string): Promise<StudentRecord | null>;
  findStudentById(id: string): Promise<StudentRecord | null>;

  findClassName(classId: string | null): Promise<string | null>;
  findSubjectName(subjectId: string | null): Promise<string | null>;

  findExam(examId: string): Promise<ExamRecord | null>;
  upsertSubject(subject: SubjectRecord): Promise<void>;
  upsertExam(exam: {
    id: string;
    title: string;
    subjectId: string | null;
    durationMin: number;
    settings: ExamSettings;
    syncedAt: string;
  }): Promise<void>;

  findSitting(id: string): Promise<SittingRecord | null>;
  /** Open sittings for one class, newest window first. */
  listOpenSittingsForClass(classId: string): Promise<SittingRecord[]>;
  countOpenSittings(): Promise<number>;

  /**
   * The sitting that blocks an update: one that is `open`, or `scheduled` with a
   * window starting at or before `dueBefore` (ISO). Used by the update guard
   * (CBT-04 section 6.4, API spec 17.5).
   */
  findBlockingSitting(dueBefore: string): Promise<SittingRecord | null>;

  countInProgressSessions(): Promise<number>;
  countSubmittedSessions(): Promise<number>;
  openSitting(sittingId: string): Promise<void>;
  closeSitting(sittingId: string): Promise<void>;

  findSeatByIp(ip: string): Promise<SeatRecord | null>;
  touchSeat(code: string, at: string, ip: string | null): Promise<void>;
}
