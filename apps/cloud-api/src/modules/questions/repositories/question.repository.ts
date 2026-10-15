import type { QuestionDomainRecord, CreateQuestionDto, UpdateQuestionDto, QuestionSearchParams } from '../domain/types';

export interface QuestionRepository {
  findById(id: string): Promise<QuestionDomainRecord | null>;
  findBySchoolId(schoolId: string): Promise<QuestionDomainRecord[]>;
  search(params: QuestionSearchParams): Promise<{ questions: QuestionDomainRecord[]; total: number }>;
  create(dto: CreateQuestionDto, schoolId: string, createdBy: string): Promise<QuestionDomainRecord>;
  update(id: string, dto: UpdateQuestionDto): Promise<QuestionDomainRecord>;
  delete(id: string): Promise<void>;
  approve(id: string, approvedBy: string): Promise<QuestionDomainRecord>;
  retire(id: string): Promise<QuestionDomainRecord>;
  incrementUsage(id: string): Promise<void>;
}
