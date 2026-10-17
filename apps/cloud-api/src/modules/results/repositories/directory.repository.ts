import { Injectable } from '@nestjs/common';
import type {
  ClassInfo,
  ExamInfo,
  ExamQuestionKeyInfo,
  GuardianInfo,
  GuardianshipInfo,
  SittingInfo,
  StudentInfo,
} from '../domain/types';

/** Injection token for {@link DirectoryRepository}. */
export const RESULTS_DIRECTORY = Symbol('RESULTS_DIRECTORY');

/**
 * Read-only view over the identity and exam tables that the results, analytics
 * and parent modules need. Keeping it behind one port means the write-side
 * repositories of other modules stay untouched and the modules are testable
 * without a database.
 */
export interface DirectoryRepository {
  getExam(examId: string): Promise<ExamInfo | null>;
  /** The exam's questions with `exam_questions.marks_override` already applied. */
  listExamQuestions(examId: string): Promise<ExamQuestionKeyInfo[]>;
  getStudent(studentId: string): Promise<StudentInfo | null>;
  listStudents(ids: string[]): Promise<StudentInfo[]>;
  getClass(classId: string): Promise<ClassInfo | null>;
  getSitting(sittingId: string): Promise<SittingInfo | null>;
  getGuardian(guardianId: string): Promise<GuardianInfo | null>;
  getGuardianByUserId(userId: string): Promise<GuardianInfo | null>;
  getGuardianship(guardianId: string, studentId: string): Promise<GuardianshipInfo | null>;
  listGuardianshipsByGuardian(guardianId: string): Promise<GuardianshipInfo[]>;
  listGuardianshipsByStudent(studentId: string): Promise<GuardianshipInfo[]>;
}

/** Seed helpers exposed by the in-memory directory for tests and local runs. */
@Injectable()
export class InMemoryDirectoryRepository implements DirectoryRepository {
  private readonly exams = new Map<string, ExamInfo>();
  private readonly examQuestions = new Map<string, ExamQuestionKeyInfo[]>();
  private readonly students = new Map<string, StudentInfo>();
  private readonly classes = new Map<string, ClassInfo>();
  private readonly sittings = new Map<string, SittingInfo>();
  private readonly guardians = new Map<string, GuardianInfo>();
  private readonly guardianships: GuardianshipInfo[] = [];

  seedExam(exam: ExamInfo): void {
    this.exams.set(exam.id, { ...exam });
  }

  seedExamQuestions(examId: string, questions: ExamQuestionKeyInfo[]): void {
    this.examQuestions.set(examId, questions.map((question) => ({ ...question })));
  }

  seedStudent(student: StudentInfo): void {
    this.students.set(student.id, { ...student });
  }

  seedClass(info: ClassInfo): void {
    this.classes.set(info.id, { ...info });
  }

  seedSitting(sitting: SittingInfo): void {
    this.sittings.set(sitting.id, { ...sitting });
  }

  seedGuardian(guardian: GuardianInfo): void {
    this.guardians.set(guardian.id, { ...guardian });
  }

  seedGuardianship(info: GuardianshipInfo): void {
    this.guardianships.push({ ...info });
  }

  async getExam(examId: string): Promise<ExamInfo | null> {
    const found = this.exams.get(examId);
    return found ? { ...found, classIds: [...found.classIds] } : null;
  }

  async listExamQuestions(examId: string): Promise<ExamQuestionKeyInfo[]> {
    return (this.examQuestions.get(examId) ?? []).map((question) => ({ ...question }));
  }

  async getStudent(studentId: string): Promise<StudentInfo | null> {
    const found = this.students.get(studentId);
    return found ? { ...found } : null;
  }

  async listStudents(ids: string[]): Promise<StudentInfo[]> {
    return ids
      .map((id) => this.students.get(id))
      .filter((student): student is StudentInfo => Boolean(student))
      .map((student) => ({ ...student }));
  }

  async getClass(classId: string): Promise<ClassInfo | null> {
    const found = this.classes.get(classId);
    return found ? { ...found } : null;
  }

  async getSitting(sittingId: string): Promise<SittingInfo | null> {
    const found = this.sittings.get(sittingId);
    return found ? { ...found } : null;
  }

  async getGuardian(guardianId: string): Promise<GuardianInfo | null> {
    const found = this.guardians.get(guardianId);
    return found ? { ...found } : null;
  }

  async getGuardianByUserId(userId: string): Promise<GuardianInfo | null> {
    for (const guardian of this.guardians.values()) {
      if (guardian.userId === userId) return { ...guardian };
    }
    return null;
  }

  async getGuardianship(guardianId: string, studentId: string): Promise<GuardianshipInfo | null> {
    const found = this.guardianships.find(
      (link) => link.guardianId === guardianId && link.studentId === studentId,
    );
    return found ? { ...found } : null;
  }

  async listGuardianshipsByGuardian(guardianId: string): Promise<GuardianshipInfo[]> {
    return this.guardianships.filter((link) => link.guardianId === guardianId).map((link) => ({ ...link }));
  }

  async listGuardianshipsByStudent(studentId: string): Promise<GuardianshipInfo[]> {
    return this.guardianships.filter((link) => link.studentId === studentId).map((link) => ({ ...link }));
  }

  clear(): void {
    this.exams.clear();
    this.examQuestions.clear();
    this.students.clear();
    this.classes.clear();
    this.sittings.clear();
    this.guardians.clear();
    this.guardianships.length = 0;
  }
}
