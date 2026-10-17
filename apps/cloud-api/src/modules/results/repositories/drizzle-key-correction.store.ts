import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { examPacks, examQuestions, questionAssets, questionOptions, questions } from '@cbt/shared-types';
import { DrizzleService, type DrizzleDB } from '../../../shared/database/drizzle.service';
import type {
  ApplyQuestionCorrectionInput,
  ApplyQuestionCorrectionResult,
  KeyCorrectionStore,
} from './key-correction.store';

/**
 * BR-12 versioning, in one transaction: clone the approved question as a new
 * `version + 1` superseding the original, copy its options (with the corrected
 * `is_correct` flags) and assets, swap it into the exam, and bump
 * `exam_packs.key_version`. The cloud never mutates the original question.
 */
@Injectable()
export class DrizzleKeyCorrectionStore implements KeyCorrectionStore {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async applyCorrection(input: ApplyQuestionCorrectionInput): Promise<ApplyQuestionCorrectionResult> {
    return this.db.transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(questions)
        .where(and(eq(questions.id, input.questionId), eq(questions.schoolId, input.schoolId)))
        .limit(1);
      if (!source) {
        throw new NotFoundException({ code: 'QUESTION_NOT_FOUND', message: 'Question not found' });
      }

      const [options, assets] = await Promise.all([
        tx.select().from(questionOptions).where(eq(questionOptions.questionId, source.id)),
        tx.select().from(questionAssets).where(eq(questionAssets.questionId, source.id)),
      ]);

      const newQuestionId = randomUUID();
      const correctOptionIds = new Set(input.correction.correctOptionIds ?? []);
      const fillAnswers = input.correction.fillAnswers
        ? {
            answers: [...input.correction.fillAnswers],
            case_sensitive: input.correction.caseSensitive ?? false,
          }
        : source.fillAnswers;

      await tx.insert(questions).values({
        id: newQuestionId,
        schoolId: source.schoolId,
        subjectId: source.subjectId,
        levelId: source.levelId,
        type: source.type,
        stem: source.stem,
        explanation: source.explanation,
        marks: source.marks,
        difficulty: source.difficulty,
        topic: source.topic,
        tags: source.tags,
        fillAnswers,
        matchingPairs: source.matchingPairs,
        correctOrder: source.correctOrder,
        status: 'approved',
        supersedesId: source.id,
        version: source.version + 1,
        usageCount: 0,
        createdBy: source.createdBy,
        approvedBy: input.actorId,
        approvedAt: new Date(),
      });

      if (options.length > 0) {
        await tx.insert(questionOptions).values(
          options.map((option) => ({
            id: randomUUID(),
            questionId: newQuestionId,
            label: option.label,
            body: option.body,
            // A choice correction sets exactly the corrected options; otherwise
            // the copied option keeps its original correctness.
            isCorrect: correctOptionIds.size > 0 ? correctOptionIds.has(option.id) : option.isCorrect,
            sortOrder: option.sortOrder,
            assetId: option.assetId,
          })),
        );
      }

      if (assets.length > 0) {
        await tx.insert(questionAssets).values(
          assets.map((asset) => ({
            questionId: newQuestionId,
            assetId: asset.assetId,
            assetRole: asset.assetRole,
          })),
        );
      }

      const [examQuestion] = await tx
        .select()
        .from(examQuestions)
        .where(and(eq(examQuestions.examId, input.examId), eq(examQuestions.questionId, input.questionId)))
        .limit(1);

      if (examQuestion) {
        await tx
          .delete(examQuestions)
          .where(and(eq(examQuestions.examId, input.examId), eq(examQuestions.questionId, input.questionId)));
        await tx.insert(examQuestions).values({
          examId: input.examId,
          questionId: newQuestionId,
          position: examQuestion.position,
          marksOverride: examQuestion.marksOverride,
        });
      }

      const packs = await tx
        .select({ keyVersion: examPacks.keyVersion })
        .from(examPacks)
        .where(eq(examPacks.examId, input.examId));
      const nextKeyVersion = packs.reduce((max, pack) => Math.max(max, pack.keyVersion), 1) + 1;
      if (packs.length > 0) {
        await tx
          .update(examPacks)
          .set({ keyVersion: nextKeyVersion })
          .where(eq(examPacks.examId, input.examId));
      }

      return { newQuestionId, newKeyVersion: nextKeyVersion };
    });
  }
}
