import { Injectable } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { exams, examQuestions } from '@cbt/shared-types';
import type { ExamRepository } from './exam.repository';
import type { ExamDomainRecord, CreateExamDto, UpdateExamDto } from '../domain/types';
import { mapExamToDomain } from '../domain/mappers';
import crypto from 'node:crypto';

@Injectable()
export class DrizzleExamRepository implements ExamRepository {
  constructor(private readonly db: DrizzleDB) {}

  async create(dto: CreateExamDto, schoolId: string, createdBy: string): Promise<ExamDomainRecord> {
    const id = crypto.randomUUID();
    const rows = await this.db
      .insert(exams)
      .values({
        id,
        schoolId,
        title: dto.title,
        subjectId: dto.subjectId,
        kind: dto.kind ?? 'exam',
        durationMin: dto.durationMin,
        shuffleQuestions: dto.shuffleQuestions ?? true,
        shuffleOptions: dto.shuffleOptions ?? true,
        negativeMarking: dto.negativeMarking ?? false,
        showScoreToStudent: dto.showScoreToStudent ?? false,
        passMarkPct: dto.passMarkPct ? String(dto.passMarkPct) : null,
        instructions: dto.instructions ?? null,
        status: 'draft',
        createdBy,
      })
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to create exam');
    }
    return mapExamToDomain(row);
  }

  async findById(id: string): Promise<ExamDomainRecord | null> {
    const [row] = await this.db.select().from(exams).where(eq(exams.id, id)).limit(1);
    return row ? mapExamToDomain(row) : null;
  }

  async findBySchoolId(schoolId: string): Promise<ExamDomainRecord[]> {
    const rows = await this.db
      .select()
      .from(exams)
      .where(eq(exams.schoolId, schoolId))
      .orderBy(desc(exams.createdAt));
    return rows.map(mapExamToDomain);
  }

  async findBySubjectId(subjectId: string): Promise<ExamDomainRecord[]> {
    const rows = await this.db
      .select()
      .from(exams)
      .where(eq(exams.subjectId, subjectId))
      .orderBy(desc(exams.createdAt));
    return rows.map(mapExamToDomain);
  }

  async update(id: string, dto: UpdateExamDto): Promise<ExamDomainRecord> {
    const rows = await this.db
      .update(exams)
      .set({
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.subjectId !== undefined && { subjectId: dto.subjectId }),
        ...(dto.kind !== undefined && { kind: dto.kind }),
        ...(dto.durationMin !== undefined && { durationMin: dto.durationMin }),
        ...(dto.shuffleQuestions !== undefined && { shuffleQuestions: dto.shuffleQuestions }),
        ...(dto.shuffleOptions !== undefined && { shuffleOptions: dto.shuffleOptions }),
        ...(dto.negativeMarking !== undefined && { negativeMarking: dto.negativeMarking }),
        ...(dto.showScoreToStudent !== undefined && { showScoreToStudent: dto.showScoreToStudent }),
        ...(dto.passMarkPct !== undefined && { passMarkPct: dto.passMarkPct ? String(dto.passMarkPct) : null }),
        ...(dto.instructions !== undefined && { instructions: dto.instructions ?? null }),
        ...(dto.status !== undefined && { status: dto.status }),
        updatedAt: new Date(),
      })
      .where(eq(exams.id, id))
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to update exam');
    }
    return mapExamToDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(exams).where(eq(exams.id, id));
  }

  async addQuestion(examId: string, questionId: string, position: number, marksOverride?: number): Promise<void> {
    await this.db.insert(examQuestions).values({
      examId,
      questionId,
      position,
      marksOverride: marksOverride ? String(marksOverride) : null,
    });
  }

  async removeQuestion(examId: string, questionId: string): Promise<void> {
    await this.db
      .delete(examQuestions)
      .where(and(eq(examQuestions.examId, examId), eq(examQuestions.questionId, questionId)));
  }

  async getQuestions(examId: string): Promise<Array<{ questionId: string; position: number; marksOverride?: number }>> {
    const rows = await this.db
      .select()
      .from(examQuestions)
      .where(eq(examQuestions.examId, examId))
      .orderBy(examQuestions.position);
    return rows.map((row: typeof examQuestions.$inferSelect) => ({
      questionId: row.questionId,
      position: row.position,
      marksOverride: row.marksOverride ? Number(row.marksOverride) : undefined,
    }));
  }
}
