import type { QuestionAssetDomainRecord, CreateQuestionAssetDto } from '../domain/types';

export interface QuestionAssetRepository {
  findByQuestionId(questionId: string): Promise<QuestionAssetDomainRecord[]>;
  findByAssetId(assetId: string): Promise<QuestionAssetDomainRecord[]>;
  create(dto: CreateQuestionAssetDto): Promise<QuestionAssetDomainRecord>;
  delete(questionId: string, assetId: string): Promise<void>;
  deleteByQuestionId(questionId: string): Promise<void>;
}
