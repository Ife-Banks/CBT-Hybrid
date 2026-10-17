import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  classes,
  examClasses,
  examQuestions,
  exams,
  guardians,
  guardianships,
  questionOptions,
  questions,
  sittings,
  students,
  subjects,
} from '@cbt/shared-types';
import { DrizzleService, type DrizzleDB } from '../../../shared/database/drizzle.service';
import { buildQuestionKey } from '../domain/build-keys';
import { num } from '../domain/mappers';
import type {
  ClassInfo,
  ExamInfo,
  ExamQuestionKeyInfo,
  GuardianInfo,
  GuardianshipInfo,
  SittingInfo,
  StudentInfo,
} from '../domain/types';
import type { DirectoryRepository } from './directory.repository';

function fullName(row: {
  firstName: string;
  lastName: string;
  otherNames: string | null;
}): string {
  return [row.firstName, row.otherNames, row.lastName].filter(Boolean).join(' ');
}

function fillKey(fillAnswers: unknown): { answers: string[]; caseSensitive: boolean } {
  if (Array.isArray(fillAnswers)) return { answers: fillAnswers as string[], caseSensitive: false };
  if (fillAnswers && typeof fillAnswers === 'object') {
    const obj = fillAnswers as { answers?: string[]; case_sensitive?: boolean };
    return { answers: obj.answers ?? [], caseSensitive: obj.case_sensitive ?? false };
  }
  return { answers: [], caseSensitive: false };
}

function pairs(value: unknown): Array<{ left: string; right: string }> {
  return Array.isArray(value) ? (value as Array<{ left: string; right: string }>) : [];
}

function order(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

@Injectable()
export class DrizzleDirectoryRepository implements DirectoryRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async getExam(examId: string): Promise<ExamInfo | null> {
    const [exam] = await this.db.select().from(exams).where(eq(exams.id, examId)).limit(1);
    if (!exam) return null;
    const [subject] = await this.db
      .select({ name: subjects.name })
      .from(subjects)
      .where(eq(subjects.id, exam.subjectId))
      .limit(1);
    const linked = await this.db
      .select({ classId: examClasses.classId })
      .from(examClasses)
      .where(eq(examClasses.examId, examId));
    return {
      id: exam.id,
      schoolId: exam.schoolId,
      title: exam.title,
      subjectId: exam.subjectId,
      subjectName: subject?.name ?? null,
      classIds: linked.map((row) => row.classId),
      passMarkPct: num(exam.passMarkPct),
      showScoreToStudent: exam.showScoreToStudent,
      createdBy: exam.createdBy,
    };
  }

  async listExamQuestions(examId: string): Promise<ExamQuestionKeyInfo[]> {
    const rows = await this.db
      .select({
        questionId: examQuestions.questionId,
        position: examQuestions.position,
        marksOverride: examQuestions.marksOverride,
        type: questions.type,
        marks: questions.marks,
        fillAnswers: questions.fillAnswers,
        matchingPairs: questions.matchingPairs,
        correctOrder: questions.correctOrder,
      })
      .from(examQuestions)
      .innerJoin(questions, eq(questions.id, examQuestions.questionId))
      .where(eq(examQuestions.examId, examId))
      .orderBy(examQuestions.position);
    if (rows.length === 0) return [];

    const optionRows = await this.db
      .select({
        questionId: questionOptions.questionId,
        id: questionOptions.id,
        isCorrect: questionOptions.isCorrect,
      })
      .from(questionOptions)
      .where(
        inArray(
          questionOptions.questionId,
          rows.map((row) => row.questionId),
        ),
      );
    const correctByQuestion = new Map<string, string[]>();
    for (const option of optionRows) {
      if (!option.isCorrect) continue;
      const list = correctByQuestion.get(option.questionId) ?? [];
      list.push(option.id);
      correctByQuestion.set(option.questionId, list);
    }

    return rows.map((row) => {
      const marks = num(row.marksOverride) ?? num(row.marks) ?? 0;
      const fill = fillKey(row.fillAnswers);
      return {
        questionId: row.questionId,
        examId,
        position: row.position,
        marks,
        key: buildQuestionKey({
          type: row.type,
          marks,
          correctOptionIds: correctByQuestion.get(row.questionId) ?? [],
          fillAnswers: fill.answers,
          fillCaseSensitive: fill.caseSensitive,
          correctOrder: order(row.correctOrder),
          matchingPairs: pairs(row.matchingPairs),
        }),
      };
    });
  }

  async getStudent(studentId: string): Promise<StudentInfo | null> {
    const [row] = await this.db.select().from(students).where(eq(students.id, studentId)).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      schoolId: row.schoolId,
      fullName: fullName(row),
      admissionNo: row.admissionNo,
      photoUrl: row.photoAssetId,
    };
  }

  async listStudents(ids: string[]): Promise<StudentInfo[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.select().from(students).where(inArray(students.id, ids));
    return rows.map((row) => ({
      id: row.id,
      schoolId: row.schoolId,
      fullName: fullName(row),
      admissionNo: row.admissionNo,
      photoUrl: row.photoAssetId,
    }));
  }

  async getClass(classId: string): Promise<ClassInfo | null> {
    const [row] = await this.db.select().from(classes).where(eq(classes.id, classId)).limit(1);
    if (!row) return null;
    return { id: row.id, schoolId: row.schoolId, name: row.name, section: row.section };
  }

  async getSitting(sittingId: string): Promise<SittingInfo | null> {
    const [row] = await this.db.select().from(sittings).where(eq(sittings.id, sittingId)).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      schoolId: row.schoolId,
      examId: row.examId,
      classId: row.classId,
      status: row.status,
    };
  }

  async getGuardian(guardianId: string): Promise<GuardianInfo | null> {
    const [row] = await this.db
      .select()
      .from(guardians)
      .where(eq(guardians.id, guardianId))
      .limit(1);
    return row ? mapGuardian(row) : null;
  }

  async getGuardianByUserId(userId: string): Promise<GuardianInfo | null> {
    const [row] = await this.db
      .select()
      .from(guardians)
      .where(eq(guardians.userId, userId))
      .limit(1);
    return row ? mapGuardian(row) : null;
  }

  async getGuardianship(guardianId: string, studentId: string): Promise<GuardianshipInfo | null> {
    const [row] = await this.db
      .select()
      .from(guardianships)
      .where(and(eq(guardianships.guardianId, guardianId), eq(guardianships.studentId, studentId)))
      .limit(1);
    return row ? mapGuardianship(row) : null;
  }

  async listGuardianshipsByGuardian(guardianId: string): Promise<GuardianshipInfo[]> {
    const rows = await this.db
      .select()
      .from(guardianships)
      .where(eq(guardianships.guardianId, guardianId))
      .orderBy(desc(guardianships.createdAt));
    return rows.map(mapGuardianship);
  }

  async listGuardianshipsByStudent(studentId: string): Promise<GuardianshipInfo[]> {
    const rows = await this.db
      .select()
      .from(guardianships)
      .where(eq(guardianships.studentId, studentId));
    return rows.map(mapGuardianship);
  }
}

function mapGuardian(row: {
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

function mapGuardianship(row: {
  guardianId: string;
  studentId: string;
  relationship: string | null;
  canViewResults: boolean;
}): GuardianshipInfo {
  return {
    guardianId: row.guardianId,
    studentId: row.studentId,
    relationship: row.relationship,
    canViewResults: row.canViewResults,
  };
}
