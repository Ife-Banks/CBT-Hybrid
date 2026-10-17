import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { exams, guardians, guardianships, results, students, submissions } from '@cbt/shared-types';
import { DrizzleService, type DrizzleDB } from '../../shared/database/drizzle.service';
import type {
  StudentDataRepository,
  StudentDataSet,
  StudentGuardian,
  StudentProfile,
  StudentResult,
} from './student-data.repository';

/** Drizzle-backed student personal-data access (API spec 5, US-16.2). */
@Injectable()
export class DrizzleStudentDataRepository implements StudentDataRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async collect(studentId: string): Promise<StudentDataSet | null> {
    const row = await this.db.query.students.findFirst({ where: eq(students.id, studentId) });
    if (!row) return null;

    const guardianRows = await this.db
      .select({
        id: guardians.id,
        fullName: guardians.fullName,
        email: guardians.email,
        phoneE164: guardians.phoneE164,
        relationship: guardianships.relationship,
        canViewResults: guardianships.canViewResults,
      })
      .from(guardianships)
      .innerJoin(guardians, eq(guardianships.guardianId, guardians.id))
      .where(eq(guardianships.studentId, studentId));

    const resultRows = await this.db
      .select({
        id: results.id,
        examId: results.examId,
        examTitle: exams.title,
        status: results.status,
        score: results.score,
        maxScore: results.maxScore,
        percent: results.percent,
        grade: results.grade,
        releasedAt: results.releasedAt,
      })
      .from(results)
      .leftJoin(exams, eq(results.examId, exams.id))
      .where(eq(results.studentId, studentId))
      .orderBy(desc(results.createdAt));

    const profile: StudentProfile = {
      id: row.id,
      schoolId: row.schoolId,
      admissionNo: row.admissionNo,
      firstName: row.firstName,
      lastName: row.lastName,
      otherNames: row.otherNames,
      gender: row.gender,
      dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString().slice(0, 10) : null,
      photoAssetId: row.photoAssetId,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };

    const guardianList: StudentGuardian[] = guardianRows.map((guardian) => ({
      id: guardian.id,
      fullName: guardian.fullName,
      email: guardian.email,
      phoneE164: guardian.phoneE164,
      relationship: guardian.relationship,
      canViewResults: guardian.canViewResults,
    }));

    const resultList: StudentResult[] = resultRows.map((result) => ({
      id: result.id,
      examId: result.examId,
      examTitle: result.examTitle,
      status: result.status,
      score: toNumber(result.score),
      maxScore: toNumber(result.maxScore),
      percent: toNumber(result.percent),
      grade: result.grade,
      releasedAt: result.releasedAt ? result.releasedAt.toISOString() : null,
    }));

    return { profile, guardians: guardianList, results: resultList };
  }

  async anonymise(studentId: string, pseudonym: string): Promise<boolean> {
    const rows = await this.db
      .update(students)
      .set({
        admissionNo: pseudonym,
        firstName: 'Anonymised',
        lastName: 'Student',
        otherNames: null,
        gender: null,
        dateOfBirth: null,
        photoAssetId: null,
        updatedAt: new Date(),
      })
      .where(eq(students.id, studentId))
      .returning({ id: students.id });
    return rows.length > 0;
  }

  async purgeScores(studentId: string): Promise<void> {
    // Deleting submissions cascades to results and submission_answers.
    await this.db.delete(submissions).where(eq(submissions.studentId, studentId));
    await this.db.delete(results).where(eq(results.studentId, studentId));
  }
}

function toNumber(value: string | number | null): number {
  if (value === null) return 0;
  return typeof value === 'number' ? value : Number(value);
}
