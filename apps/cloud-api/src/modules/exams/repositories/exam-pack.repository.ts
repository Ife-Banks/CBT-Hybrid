import type { ExamPackDomainRecord, CreateExamPackDto } from '../domain/types';

export interface ExamPackRepository {
  create(dto: CreateExamPackDto): Promise<ExamPackDomainRecord>;
  findById(id: string): Promise<ExamPackDomainRecord | null>;
  findByExamId(examId: string): Promise<ExamPackDomainRecord[]>;
  findByExamIdAndVersion(examId: string, version: number): Promise<ExamPackDomainRecord | null>;
  getLatestVersion(examId: string): Promise<number>;
  delete(id: string): Promise<void>;
}
