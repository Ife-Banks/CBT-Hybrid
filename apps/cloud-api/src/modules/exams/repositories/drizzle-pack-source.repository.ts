import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { DrizzleService } from '../../../shared/database/drizzle.service';
import {
  assets,
  exams,
  examQuestions,
  questionAssets,
  questionOptions,
  questions,
  subjects,
} from '@cbt/shared-types';
import type { PackSourceRepository } from './pack-source.repository';
import type { PackSourceBundle, PackSourceQuestion, PackSourceQuestionOption } from '../domain/types';

@Injectable()
export class DrizzlePackSourceRepository implements PackSourceRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async gather(examId: string): Promise<PackSourceBundle | null> {
    const [examRow] = await this.db
      .select({ subjectId: exams.subjectId })
      .from(exams)
      .where(eq(exams.id, examId))
      .limit(1);
    if (!examRow) {
      return null;
    }

    const [subjectRow] = await this.db
      .select()
      .from(subjects)
      .where(eq(subjects.id, examRow.subjectId))
      .limit(1);

    const rows = await this.db
      .select({
        questionId: examQuestions.questionId,
        position: examQuestions.position,
        marksOverride: examQuestions.marksOverride,
        version: questions.version,
        type: questions.type,
        stem: questions.stem,
        marks: questions.marks,
        fillAnswers: questions.fillAnswers,
        correctOrder: questions.correctOrder,
        matchingPairs: questions.matchingPairs,
      })
      .from(examQuestions)
      .innerJoin(questions, eq(examQuestions.questionId, questions.id))
      .where(eq(examQuestions.examId, examId))
      .orderBy(examQuestions.position);

    const questionIds = rows.map((row) => row.questionId);

    const optionRows = questionIds.length
      ? await this.db
          .select()
          .from(questionOptions)
          .where(inArray(questionOptions.questionId, questionIds))
          .orderBy(questionOptions.sortOrder)
      : [];

    const linkRows = questionIds.length
      ? await this.db
          .select()
          .from(questionAssets)
          .where(inArray(questionAssets.questionId, questionIds))
      : [];

    const assetIds = [...new Set(linkRows.map((row) => row.assetId))];
    const assetRows = assetIds.length
      ? await this.db.select().from(assets).where(inArray(assets.id, assetIds))
      : [];

    const optionsByQuestion = new Map<string, PackSourceQuestionOption[]>();
    for (const option of optionRows) {
      const list = optionsByQuestion.get(option.questionId) ?? [];
      list.push({
        id: option.id,
        label: option.label,
        body: option.body,
        isCorrect: option.isCorrect,
        sortOrder: option.sortOrder,
      });
      optionsByQuestion.set(option.questionId, list);
    }

    const assetIdsByQuestion = new Map<string, string[]>();
    for (const link of linkRows) {
      const list = assetIdsByQuestion.get(link.questionId) ?? [];
      list.push(link.assetId);
      assetIdsByQuestion.set(link.questionId, list);
    }

    const packQuestions: PackSourceQuestion[] = rows.map((row) => ({
      questionId: row.questionId,
      version: row.version,
      position: row.position,
      marksOverride: row.marksOverride != null ? Number(row.marksOverride) : undefined,
      type: row.type,
      stem: row.stem,
      marks: Number(row.marks),
      options: optionsByQuestion.get(row.questionId) ?? [],
      assetIds: assetIdsByQuestion.get(row.questionId) ?? [],
      fillAnswers: (row.fillAnswers as Record<string, unknown> | null) ?? undefined,
      correctOrder: (row.correctOrder as string[] | null) ?? undefined,
      matchingPairs: (row.matchingPairs as Array<{ left: string; right: string }> | null) ?? undefined,
    }));

    return {
      subject: subjectRow
        ? { id: subjectRow.id, name: subjectRow.name, section: subjectRow.section ?? undefined }
        : { id: examRow.subjectId, name: '' },
      questions: packQuestions,
      assets: assetRows.map((row) => ({
        id: row.id,
        filename: row.filename,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        storagePath: row.storagePath,
      })),
    };
  }
}
