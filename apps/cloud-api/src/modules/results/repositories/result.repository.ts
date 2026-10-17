import { Injectable } from '@nestjs/common';
import type { ResultRecord, ResultStatus } from '../domain/types';

/** Injection token for {@link ResultRepository}. */
export const RESULT_REPOSITORY = Symbol('RESULT_REPOSITORY');

export interface CreateResultInput {
  id?: string;
  submissionId: string;
  schoolId: string;
  studentId: string;
  examId: string;
  subjectId?: string | null;
  classId?: string | null;
  score: number;
  maxScore: number;
  percent: number;
  grade?: string | null;
  keyVersion?: number;
  status?: ResultStatus;
  revision?: number;
}

export interface ResultFilter {
  schoolId: string;
  examId?: string;
  classId?: string;
  studentId?: string;
  status?: ResultStatus;
  statuses?: ResultStatus[];
}

export interface ResultRepository {
  create(input: CreateResultInput): Promise<ResultRecord>;
  upsertForSubmission(input: CreateResultInput): Promise<ResultRecord>;
  findById(id: string): Promise<ResultRecord | null>;
  findBySubmissionId(submissionId: string): Promise<ResultRecord | null>;
  list(filter: ResultFilter): Promise<ResultRecord[]>;
  update(id: string, patch: Partial<Omit<ResultRecord, 'id' | 'createdAt'>>): Promise<ResultRecord>;
  bulkUpdate(ids: string[], patch: Partial<Omit<ResultRecord, 'id' | 'createdAt'>>): Promise<number>;
  deleteBySubmissionId(submissionId: string): Promise<number>;
  countByStatus(schoolId: string, status: ResultStatus): Promise<number>;
}

@Injectable()
export class InMemoryResultRepository implements ResultRepository {
  private readonly results = new Map<string, ResultRecord>();
  private counter = 0;

  async create(input: CreateResultInput): Promise<ResultRecord> {
    this.counter += 1;
    const now = new Date();
    const record: ResultRecord = {
      id: input.id ?? `result-${this.counter}`,
      submissionId: input.submissionId,
      schoolId: input.schoolId,
      studentId: input.studentId,
      examId: input.examId,
      subjectId: input.subjectId ?? null,
      classId: input.classId ?? null,
      score: input.score,
      maxScore: input.maxScore,
      percent: input.percent,
      grade: input.grade ?? null,
      keyVersion: input.keyVersion ?? 1,
      status: input.status ?? 'draft',
      revision: input.revision ?? 1,
      reviewedBy: null,
      reviewedAt: null,
      releasedBy: null,
      releasedAt: null,
      withdrawnReason: null,
      teacherComment: null,
      updated: false,
      createdAt: now,
      updatedAt: now,
    };
    this.results.set(record.id, record);
    return clone(record);
  }

  async upsertForSubmission(input: CreateResultInput): Promise<ResultRecord> {
    const existing = await this.findBySubmissionId(input.submissionId);
    if (!existing) return this.create(input);
    const updated: ResultRecord = {
      ...existing,
      score: input.score,
      maxScore: input.maxScore,
      percent: input.percent,
      grade: input.grade ?? null,
      keyVersion: input.keyVersion ?? existing.keyVersion,
      classId: input.classId ?? existing.classId,
      subjectId: input.subjectId ?? existing.subjectId,
      updatedAt: new Date(),
    };
    this.results.set(updated.id, updated);
    return clone(updated);
  }

  async findById(id: string): Promise<ResultRecord | null> {
    const found = this.results.get(id);
    return found ? clone(found) : null;
  }

  async findBySubmissionId(submissionId: string): Promise<ResultRecord | null> {
    for (const record of this.results.values()) {
      if (record.submissionId === submissionId) return clone(record);
    }
    return null;
  }

  async list(filter: ResultFilter): Promise<ResultRecord[]> {
    const statuses = filter.statuses ?? (filter.status ? [filter.status] : undefined);
    return [...this.results.values()]
      .filter((record) => record.schoolId === filter.schoolId)
      .filter((record) => !filter.examId || record.examId === filter.examId)
      .filter((record) => !filter.classId || record.classId === filter.classId)
      .filter((record) => !filter.studentId || record.studentId === filter.studentId)
      .filter((record) => !statuses || statuses.includes(record.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(clone);
  }

  async update(
    id: string,
    patch: Partial<Omit<ResultRecord, 'id' | 'createdAt'>>,
  ): Promise<ResultRecord> {
    const existing = this.results.get(id);
    if (!existing) throw new Error(`result ${id} not found`);
    const updated: ResultRecord = { ...existing, ...patch, updatedAt: new Date() };
    this.results.set(id, updated);
    return clone(updated);
  }

  async bulkUpdate(
    ids: string[],
    patch: Partial<Omit<ResultRecord, 'id' | 'createdAt'>>,
  ): Promise<number> {
    let count = 0;
    for (const id of ids) {
      const existing = this.results.get(id);
      if (!existing) continue;
      this.results.set(id, { ...existing, ...patch, updatedAt: new Date() });
      count += 1;
    }
    return count;
  }

  async deleteBySubmissionId(submissionId: string): Promise<number> {
    let count = 0;
    for (const [id, record] of this.results.entries()) {
      if (record.submissionId === submissionId) {
        this.results.delete(id);
        count += 1;
      }
    }
    return count;
  }

  async countByStatus(schoolId: string, status: ResultStatus): Promise<number> {
    let count = 0;
    for (const record of this.results.values()) {
      if (record.schoolId === schoolId && record.status === status) count += 1;
    }
    return count;
  }

  clear(): void {
    this.results.clear();
    this.counter = 0;
  }
}

function clone(record: ResultRecord): ResultRecord {
  return { ...record };
}
