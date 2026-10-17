import { Injectable } from '@nestjs/common';
import type {
  SubmissionAnswerRecord,
  SubmissionRecord,
  SubmissionStatus,
} from '../domain/types';

/** Injection token for {@link SubmissionRepository}. */
export const SUBMISSION_REPOSITORY = Symbol('SUBMISSION_REPOSITORY');

export interface UpsertSubmissionInput {
  id: string;
  schoolId: string;
  sittingId: string;
  studentId: string;
  examId: string;
  classId?: string | null;
  packVersion: number;
  keyVersion?: number;
  seat?: string | null;
  startedAt?: Date | null;
  submittedAt?: Date | null;
  submitReason?: string | null;
  schoolScore?: number | null;
  cloudScore?: number | null;
  focusLostCount?: number;
  extraSeconds?: number;
}

export interface SubmissionFilter {
  schoolId: string;
  examId?: string;
  classId?: string;
  studentId?: string;
  sittingId?: string;
  status?: SubmissionStatus;
}

export interface SubmissionRepository {
  findById(id: string): Promise<SubmissionRecord | null>;
  findBySittingAndStudent(sittingId: string, studentId: string): Promise<SubmissionRecord | null>;
  upsert(input: UpsertSubmissionInput): Promise<SubmissionRecord>;
  update(
    id: string,
    patch: Partial<Omit<SubmissionRecord, 'id' | 'schoolId' | 'createdAt'>>,
  ): Promise<SubmissionRecord>;
  voidById(id: string): Promise<SubmissionRecord | null>;
  saveAnswers(submissionId: string, answers: SubmissionAnswerRecord[]): Promise<void>;
  listAnswers(submissionId: string): Promise<SubmissionAnswerRecord[]>;
  listAnswersForSubmissions(submissionIds: string[]): Promise<SubmissionAnswerRecord[]>;
  list(filter: SubmissionFilter): Promise<SubmissionRecord[]>;
}

@Injectable()
export class InMemorySubmissionRepository implements SubmissionRepository {
  private readonly submissions = new Map<string, SubmissionRecord>();
  private readonly answers = new Map<string, Map<string, SubmissionAnswerRecord>>();

  async findById(id: string): Promise<SubmissionRecord | null> {
    const found = this.submissions.get(id);
    return found ? clone(found) : null;
  }

  async findBySittingAndStudent(
    sittingId: string,
    studentId: string,
  ): Promise<SubmissionRecord | null> {
    for (const submission of this.submissions.values()) {
      if (submission.sittingId === sittingId && submission.studentId === studentId) {
        return clone(submission);
      }
    }
    return null;
  }

  async upsert(input: UpsertSubmissionInput): Promise<SubmissionRecord> {
    const existing = this.submissions.get(input.id);
    const now = new Date();
    const record: SubmissionRecord = {
      id: input.id,
      schoolId: input.schoolId,
      sittingId: input.sittingId,
      studentId: input.studentId,
      examId: input.examId,
      classId: input.classId ?? existing?.classId ?? null,
      packVersion: input.packVersion ?? existing?.packVersion ?? 1,
      keyVersion: input.keyVersion ?? existing?.keyVersion ?? 1,
      seat: input.seat ?? existing?.seat ?? null,
      startedAt: input.startedAt ?? existing?.startedAt ?? null,
      submittedAt: input.submittedAt ?? existing?.submittedAt ?? null,
      submitReason: input.submitReason ?? existing?.submitReason ?? null,
      status: existing?.status ?? 'active',
      schoolScore: input.schoolScore ?? existing?.schoolScore ?? null,
      cloudScore: input.cloudScore ?? existing?.cloudScore ?? null,
      focusLostCount: input.focusLostCount ?? existing?.focusLostCount ?? 0,
      extraSeconds: input.extraSeconds ?? existing?.extraSeconds ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.submissions.set(record.id, record);
    return clone(record);
  }

  async update(
    id: string,
    patch: Partial<Omit<SubmissionRecord, 'id' | 'schoolId' | 'createdAt'>>,
  ): Promise<SubmissionRecord> {
    const existing = this.submissions.get(id);
    if (!existing) throw new Error(`submission ${id} not found`);
    const updated: SubmissionRecord = { ...existing, ...patch, updatedAt: new Date() };
    this.submissions.set(id, updated);
    return clone(updated);
  }

  async voidById(id: string): Promise<SubmissionRecord | null> {
    const existing = this.submissions.get(id);
    if (!existing) return null;
    const updated: SubmissionRecord = { ...existing, status: 'voided', updatedAt: new Date() };
    this.submissions.set(id, updated);
    return clone(updated);
  }

  async saveAnswers(submissionId: string, answers: SubmissionAnswerRecord[]): Promise<void> {
    const bucket = this.answers.get(submissionId) ?? new Map<string, SubmissionAnswerRecord>();
    for (const answer of answers) bucket.set(answer.questionId, { ...answer });
    this.answers.set(submissionId, bucket);
  }

  async listAnswers(submissionId: string): Promise<SubmissionAnswerRecord[]> {
    return [...(this.answers.get(submissionId)?.values() ?? [])].map((answer) => ({ ...answer }));
  }

  async listAnswersForSubmissions(submissionIds: string[]): Promise<SubmissionAnswerRecord[]> {
    const wanted = new Set(submissionIds);
    const result: SubmissionAnswerRecord[] = [];
    for (const [submissionId, bucket] of this.answers.entries()) {
      if (!wanted.has(submissionId)) continue;
      for (const answer of bucket.values()) result.push({ ...answer });
    }
    return result;
  }

  async list(filter: SubmissionFilter): Promise<SubmissionRecord[]> {
    return [...this.submissions.values()]
      .filter((submission) => submission.schoolId === filter.schoolId)
      .filter((submission) => !filter.examId || submission.examId === filter.examId)
      .filter((submission) => !filter.classId || submission.classId === filter.classId)
      .filter((submission) => !filter.studentId || submission.studentId === filter.studentId)
      .filter((submission) => !filter.sittingId || submission.sittingId === filter.sittingId)
      .filter((submission) => !filter.status || submission.status === filter.status)
      .map(clone);
  }

  clear(): void {
    this.submissions.clear();
    this.answers.clear();
  }
}

function clone(submission: SubmissionRecord): SubmissionRecord {
  return { ...submission };
}
