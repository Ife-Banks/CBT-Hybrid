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

  findSeatByIp(ip: string): Promise<SeatRecord | null>;
  touchSeat(code: string, at: string, ip: string | null): Promise<void>;
}
