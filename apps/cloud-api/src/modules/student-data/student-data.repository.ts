import { Injectable } from '@nestjs/common';

/** Injection token for {@link StudentDataRepository}. */
export const STUDENT_DATA_REPOSITORY = Symbol('STUDENT_DATA_REPOSITORY');

/** A student's identity fields (US-16.2 data export / anonymisation). */
export interface StudentProfile {
  id: string;
  schoolId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  gender: string | null;
  /** ISO-8601 date, or null. */
  dateOfBirth: string | null;
  photoAssetId: string | null;
  status: string;
  createdAt: string;
}

/** A guardian linked to the student. */
export interface StudentGuardian {
  id: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  relationship: string | null;
  canViewResults: boolean;
}

/** A result held for the student. */
export interface StudentResult {
  id: string;
  examId: string;
  examTitle: string | null;
  status: string;
  score: number;
  maxScore: number;
  percent: number;
  grade: string | null;
  releasedAt: string | null;
}

/** Everything the data export needs for one student. */
export interface StudentDataSet {
  profile: StudentProfile;
  guardians: StudentGuardian[];
  results: StudentResult[];
}

/**
 * Read/write access to the personal data held about a student (API spec 5,
 * US-16.2). Kept as its own port so the privacy endpoints do not reach into the
 * user-management write repositories.
 */
export interface StudentDataRepository {
  /** Profile plus linked guardians and results, or null when not found. */
  collect(studentId: string): Promise<StudentDataSet | null>;
  /** Replace the identity fields, keeping the row and its scores. */
  anonymise(studentId: string, pseudonym: string): Promise<boolean>;
  /** Delete the student's results and submissions (retention rule of zero). */
  purgeScores(studentId: string): Promise<void>;
}

/** In-memory store for tests and local runs (no `DATABASE_URL`). */
@Injectable()
export class InMemoryStudentDataRepository implements StudentDataRepository {
  private readonly profiles = new Map<string, StudentProfile>();
  private readonly guardians = new Map<string, StudentGuardian[]>();
  private readonly results = new Map<string, StudentResult[]>();

  seedProfile(profile: StudentProfile): void {
    this.profiles.set(profile.id, { ...profile });
  }

  seedGuardian(studentId: string, guardian: StudentGuardian): void {
    const list = this.guardians.get(studentId) ?? [];
    list.push({ ...guardian });
    this.guardians.set(studentId, list);
  }

  seedResult(studentId: string, result: StudentResult): void {
    const list = this.results.get(studentId) ?? [];
    list.push({ ...result });
    this.results.set(studentId, list);
  }

  async collect(studentId: string): Promise<StudentDataSet | null> {
    const profile = this.profiles.get(studentId);
    if (!profile) return null;
    return {
      profile: { ...profile },
      guardians: (this.guardians.get(studentId) ?? []).map((guardian) => ({ ...guardian })),
      results: (this.results.get(studentId) ?? []).map((result) => ({ ...result })),
    };
  }

  async anonymise(studentId: string, pseudonym: string): Promise<boolean> {
    const profile = this.profiles.get(studentId);
    if (!profile) return false;
    this.profiles.set(studentId, {
      ...profile,
      admissionNo: pseudonym,
      firstName: 'Anonymised',
      lastName: 'Student',
      otherNames: null,
      gender: null,
      dateOfBirth: null,
      photoAssetId: null,
    });
    return true;
  }

  async purgeScores(studentId: string): Promise<void> {
    this.results.delete(studentId);
  }

  clear(): void {
    this.profiles.clear();
    this.guardians.clear();
    this.results.clear();
  }
}
