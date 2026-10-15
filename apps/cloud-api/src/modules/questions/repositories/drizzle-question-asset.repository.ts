import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { questionAssets } from '@cbt/shared-types';
import type { QuestionAssetDomainRecord, CreateQuestionAssetDto } from '../domain/types';
import { mapQuestionAssetFromDb } from '../domain/mappers';
import type { QuestionAssetRepository } from './question-asset.repository';

@Injectable()
export class DrizzleQuestionAssetRepository implements QuestionAssetRepository {
  constructor(private readonly db: DrizzleDB) {}

  async findByQuestionId(questionId: string): Promise<QuestionAssetDomainRecord[]> {
    const rows = await this.db.query.questionAssets.findMany({
      where: eq(questionAssets.questionId, questionId),
    });
    return rows.map(mapQuestionAssetFromDb);
  }

  async findByAssetId(assetId: string): Promise<QuestionAssetDomainRecord[]> {
    const rows = await this.db.query.questionAssets.findMany({
      where: eq(questionAssets.assetId, assetId),
    });
    return rows.map(mapQuestionAssetFromDb);
  }

  async create(dto: CreateQuestionAssetDto): Promise<QuestionAssetDomainRecord> {
    const rows = await this.db
      .insert(questionAssets)
      .values({
        questionId: dto.questionId,
        assetId: dto.assetId,
        assetRole: dto.assetRole ?? 'illustration',
      })
      .returning();

    if (!rows[0]) {
      throw new Error('Failed to create question asset link');
    }

    return mapQuestionAssetFromDb(rows[0]);
  }

  async delete(questionId: string, assetId: string): Promise<void> {
    await this.db
      .delete(questionAssets)
      .where(and(eq(questionAssets.questionId, questionId), eq(questionAssets.assetId, assetId)));
  }

  async deleteByQuestionId(questionId: string): Promise<void> {
    await this.db.delete(questionAssets).where(eq(questionAssets.questionId, questionId));
  }
}
