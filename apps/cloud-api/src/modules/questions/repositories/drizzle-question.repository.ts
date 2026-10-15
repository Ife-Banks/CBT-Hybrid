import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { questions } from '@cbt/shared-types';
import type { QuestionDomainRecord, CreateQuestionDto, UpdateQuestionDto, QuestionSearchParams } from '../domain/types';
import { mapQuestionFromDb } from '../domain/mappers';
import type { QuestionRepository } from './question.repository';

@Injectable()
export class DrizzleQuestionRepository implements QuestionRepository {
  constructor(private readonly db: DrizzleDB) {}

  async findById(id: string): Promise<QuestionDomainRecord | null> {
    const row = await this.db.query.questions.findFirst({
      where: eq(questions.id, id),
    });
    return row ? mapQuestionFromDb(row) : null;
  }

  async findBySchoolId(schoolId: string): Promise<QuestionDomainRecord[]> {
    const rows = await this.db.query.questions.findMany({
      where: eq(questions.schoolId, schoolId),
      orderBy: [desc(questions.createdAt)],
    });
    return rows.map(mapQuestionFromDb);
  }

  async search(params: QuestionSearchParams): Promise<{ questions: QuestionDomainRecord[]; total: number }> {
    const { schoolId, filter, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = params;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(questions.schoolId, schoolId)];

    if (filter.subjectId) {
      conditions.push(eq(questions.subjectId, filter.subjectId));
    }
    if (filter.levelId) {
      conditions.push(eq(questions.levelId, filter.levelId));
    }
    if (filter.type) {
      conditions.push(eq(questions.type, filter.type as any));
    }
    if (filter.difficulty) {
      conditions.push(eq(questions.difficulty, filter.difficulty as any));
    }
    if (filter.status) {
      conditions.push(eq(questions.status, filter.status as any));
    }
    if (filter.createdBy) {
      conditions.push(eq(questions.createdBy, filter.createdBy));
    }
    if (filter.tags && filter.tags.length > 0) {
      conditions.push(sql`${questions.tags} && ${questions.tags} @> ${filter.tags}`);
    }

    // Full-text search
    if (filter.search) {
      conditions.push(sql`to_tsvector('english', ${questions.stem}) @@ plainto_tsquery(${filter.search})`);
    }

    // Build order by
    const orderByColumn = sortBy === 'createdAt' ? questions.createdAt :
                         sortBy === 'updatedAt' ? questions.updatedAt :
                         sortBy === 'marks' ? questions.marks :
                         questions.usageCount;
    const order = sortOrder === 'asc' ? asc(orderByColumn) : desc(orderByColumn);

    // Get total count
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(questions)
      .where(and(...conditions));
    const count = result[0]?.count ?? 0;

    // Get paginated results
    const rows = await this.db.query.questions.findMany({
      where: and(...conditions),
      orderBy: [order],
      limit,
      offset,
    });

    return {
      questions: rows.map(mapQuestionFromDb),
      total: count,
    };
  }

  async create(dto: CreateQuestionDto, schoolId: string, createdBy: string): Promise<QuestionDomainRecord> {
    const rows = await this.db
      .insert(questions)
      .values({
        schoolId,
        subjectId: dto.subjectId,
        levelId: dto.levelId ?? null,
        type: dto.type,
        stem: dto.stem,
        explanation: dto.explanation ?? null,
        marks: String(dto.marks),
        difficulty: dto.difficulty ?? null,
        topic: dto.topic ?? null,
        tags: dto.tags ?? [],
        fillAnswers: dto.fillAnswers ? (dto.fillAnswers as any) : null,
        matchingPairs: dto.matchingPairs ? (dto.matchingPairs as any) : null,
        correctOrder: dto.correctOrder ? (dto.correctOrder as any) : null,
        status: 'draft',
        version: 1,
        usageCount: 0,
        createdBy,
      })
      .returning();

    if (!rows[0]) {
      throw new Error('Failed to create question');
    }

    return mapQuestionFromDb(rows[0]);
  }

  async update(id: string, dto: UpdateQuestionDto): Promise<QuestionDomainRecord> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }

    // Approved questions cannot be modified
    if (existing.status === 'approved') {
      throw new ConflictException('Cannot modify approved questions. Create a new version instead.');
    }

    const rows = await this.db
      .update(questions)
      .set({
        subjectId: dto.subjectId,
        levelId: dto.levelId ?? null,
        stem: dto.stem,
        explanation: dto.explanation ?? null,
        marks: dto.marks !== undefined ? String(dto.marks) : undefined,
        difficulty: dto.difficulty ?? null,
        topic: dto.topic ?? null,
        tags: dto.tags ?? [],
        fillAnswers: dto.fillAnswers ? (dto.fillAnswers as any) : null,
        matchingPairs: dto.matchingPairs ? (dto.matchingPairs as any) : null,
        correctOrder: dto.correctOrder ? (dto.correctOrder as any) : null,
        status: dto.status,
        updatedAt: new Date(),
      })
      .where(eq(questions.id, id))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Question with ID ${id} not found after update`);
    }

    return mapQuestionFromDb(rows[0]);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }

    // Approved questions cannot be deleted, only retired
    if (existing.status === 'approved') {
      throw new ConflictException('Cannot delete approved questions. Retire them instead.');
    }

    await this.db.delete(questions).where(eq(questions.id, id));
  }

  async approve(id: string, approvedBy: string): Promise<QuestionDomainRecord> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }

    if (existing.status !== 'draft') {
      throw new ConflictException('Only draft questions can be approved');
    }

    const rows = await this.db
      .update(questions)
      .set({
        status: 'approved',
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(questions.id, id))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Question with ID ${id} not found after update`);
    }

    return mapQuestionFromDb(rows[0]);
  }

  async retire(id: string): Promise<QuestionDomainRecord> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }

    const rows = await this.db
      .update(questions)
      .set({
        status: 'retired',
        updatedAt: new Date(),
      })
      .where(eq(questions.id, id))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Question with ID ${id} not found after update`);
    }

    return mapQuestionFromDb(rows[0]);
  }

  async incrementUsage(id: string): Promise<void> {
    await this.db
      .update(questions)
      .set({
        usageCount: sql`${questions.usageCount} + 1`,
      })
      .where(eq(questions.id, id));
  }
}
