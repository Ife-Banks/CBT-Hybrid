import { Injectable } from '@nestjs/common';
import type {
  RemarkCorrection,
  RemarkPreviewEntry,
  RemarkRunRecord,
  RemarkRunStatus,
} from '../domain/types';

/** Injection token for {@link RemarkRunRepository}. */
export const REMARK_RUN_REPOSITORY = Symbol('REMARK_RUN_REPOSITORY');

export interface CreateRemarkRunInput {
  id?: string;
  schoolId: string;
  examId: string;
  questionId: string;
  newQuestionId?: string | null;
  reason: string;
  requestedBy: string;
  status?: RemarkRunStatus;
  affected?: number;
  newKeyVersion?: number | null;
  correction?: RemarkCorrection | null;
  preview?: RemarkPreviewEntry[] | null;
}

export interface RemarkRunRepository {
  create(input: CreateRemarkRunInput): Promise<RemarkRunRecord>;
  findById(id: string): Promise<RemarkRunRecord | null>;
  listByExam(examId: string): Promise<RemarkRunRecord[]>;
  update(
    id: string,
    patch: Partial<Omit<RemarkRunRecord, 'id' | 'createdAt'>>,
  ): Promise<RemarkRunRecord>;
}

@Injectable()
export class InMemoryRemarkRunRepository implements RemarkRunRepository {
  private readonly runs = new Map<string, RemarkRunRecord>();
  private counter = 0;

  async create(input: CreateRemarkRunInput): Promise<RemarkRunRecord> {
    this.counter += 1;
    const record: RemarkRunRecord = {
      id: input.id ?? `remark-${this.counter}`,
      schoolId: input.schoolId,
      examId: input.examId,
      questionId: input.questionId,
      newQuestionId: input.newQuestionId ?? null,
      reason: input.reason,
      requestedBy: input.requestedBy,
      status: input.status ?? 'previewed',
      affected: input.affected ?? 0,
      newKeyVersion: input.newKeyVersion ?? null,
      correction: input.correction ? { ...input.correction } : null,
      preview: input.preview ? input.preview.map((entry) => ({ ...entry })) : null,
      appliedAt: null,
      createdAt: new Date(),
    };
    this.runs.set(record.id, record);
    return clone(record);
  }

  async findById(id: string): Promise<RemarkRunRecord | null> {
    const found = this.runs.get(id);
    return found ? clone(found) : null;
  }

  async listByExam(examId: string): Promise<RemarkRunRecord[]> {
    return [...this.runs.values()]
      .filter((run) => run.examId === examId)
      .map(clone);
  }

  async update(
    id: string,
    patch: Partial<Omit<RemarkRunRecord, 'id' | 'createdAt'>>,
  ): Promise<RemarkRunRecord> {
    const existing = this.runs.get(id);
    if (!existing) throw new Error(`remark run ${id} not found`);
    const updated: RemarkRunRecord = { ...existing, ...patch };
    this.runs.set(id, updated);
    return clone(updated);
  }

  clear(): void {
    this.runs.clear();
    this.counter = 0;
  }
}

function clone(record: RemarkRunRecord): RemarkRunRecord {
  return {
    ...record,
    correction: record.correction ? { ...record.correction } : null,
    preview: record.preview ? record.preview.map((entry) => ({ ...entry })) : null,
  };
}
