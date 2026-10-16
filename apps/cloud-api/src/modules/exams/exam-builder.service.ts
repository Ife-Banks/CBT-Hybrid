import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { ExamRepository } from './repositories';
import { DrizzleExamRepository } from './repositories';
import type { ExamDomainRecord, QuestionSelection } from './domain/types';
import { AuditService } from '../auth/audit/audit.service';

@Injectable()
export class ExamBuilderService {
  constructor(
    @Optional() @Inject(DrizzleExamRepository) private readonly examRepo?: ExamRepository,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  /**
   * Add questions to an exam using a selection method
   */
  async addQuestionsToExam(
    examId: string,
    selection: QuestionSelection,
    schoolId: string,
    actorUserId: string,
  ): Promise<void> {
    const exam = await this.examRepo!.findById(examId);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.schoolId !== schoolId) {
      throw new ConflictException('Exam does not belong to this school');
    }
    if (exam.status === 'published' || exam.status === 'archived') {
      throw new ConflictException('Cannot modify questions in a published or archived exam');
    }

    const existingQuestions = await this.examRepo!.getQuestions(examId);
    const nextPosition = existingQuestions.length + 1;

    if (selection.method === 'individual' && selection.questionIds) {
      for (let i = 0; i < selection.questionIds.length; i++) {
        await this.examRepo!.addQuestion(examId, selection.questionIds[i]!, nextPosition + i);
      }
    } else if (selection.method === 'filter' && selection.filter) {
      // In a real implementation, this would query the question bank
      // For now, we'll store the filter criteria for later processing
      // The actual question selection would be done by a separate service
      // that has access to the QuestionRepository
      throw new ConflictException('Filter-based selection not yet implemented');
    } else if (selection.method === 'random' && selection.filter) {
      throw new ConflictException('Random selection not yet implemented');
    } else if (selection.method === 'import') {
      throw new ConflictException('Import selection not yet implemented');
    }

    await this.auditService!.record({
      action: 'exam.questions_added',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: examId,
      targetType: 'exam',
      detail: { method: selection.method, count: selection.questionIds?.length },
    });
  }

  /**
   * Reorder questions in an exam
   */
  async reorderQuestions(
    examId: string,
    questionPositions: Array<{ questionId: string; position: number }>,
    schoolId: string,
    actorUserId: string,
  ): Promise<void> {
    const exam = await this.examRepo!.findById(examId);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.schoolId !== schoolId) {
      throw new ConflictException('Exam does not belong to this school');
    }
    if (exam.status === 'published' || exam.status === 'archived') {
      throw new ConflictException('Cannot modify questions in a published or archived exam');
    }

    // Remove all existing questions and re-add them in new order
    const existingQuestions = await this.examRepo!.getQuestions(examId);
    for (const existing of existingQuestions) {
      await this.examRepo!.removeQuestion(examId, existing.questionId);
    }

    for (const item of questionPositions) {
      await this.examRepo!.addQuestion(examId, item.questionId, item.position);
    }

    await this.auditService!.record({
      action: 'exam.questions_reordered',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: examId,
      targetType: 'exam',
      detail: { count: questionPositions.length },
    });
  }

  /**
   * Remove all questions from an exam
   */
  async clearQuestions(examId: string, schoolId: string, actorUserId: string): Promise<void> {
    const exam = await this.examRepo!.findById(examId);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.schoolId !== schoolId) {
      throw new ConflictException('Exam does not belong to this school');
    }
    if (exam.status === 'published' || exam.status === 'archived') {
      throw new ConflictException('Cannot modify questions in a published or archived exam');
    }

    const existingQuestions = await this.examRepo!.getQuestions(examId);
    for (const existing of existingQuestions) {
      await this.examRepo!.removeQuestion(examId, existing.questionId);
    }

    await this.auditService!.record({
      action: 'exam.questions_cleared',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: examId,
      targetType: 'exam',
      detail: { count: existingQuestions.length },
    });
  }

  /**
   * Duplicate an exam (creates a new exam with the same questions)
   */
  async duplicateExam(examId: string, schoolId: string, actorUserId: string): Promise<ExamDomainRecord> {
    const exam = await this.examRepo!.findById(examId);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.schoolId !== schoolId) {
      throw new ConflictException('Exam does not belong to this school');
    }

    // Create new exam with same settings
    const newExam = await this.examRepo!.create(
      {
        title: `${exam.title} (Copy)`,
        subjectId: exam.subjectId,
        kind: exam.kind,
        durationMin: exam.durationMin,
        shuffleQuestions: exam.shuffleQuestions,
        shuffleOptions: exam.shuffleOptions,
        negativeMarking: exam.negativeMarking,
        showScoreToStudent: exam.showScoreToStudent,
        passMarkPct: exam.passMarkPct,
        instructions: exam.instructions,
      },
      schoolId,
      actorUserId,
    );

    // Copy questions
    const existingQuestions = await this.examRepo!.getQuestions(examId);
    for (const existing of existingQuestions) {
      await this.examRepo!.addQuestion(newExam.id, existing.questionId, existing.position, existing.marksOverride);
    }

    await this.auditService!.record({
      action: 'exam.duplicated',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: newExam.id,
      targetType: 'exam',
      detail: { originalExamId: examId, questionCount: existingQuestions.length },
    });

    return newExam;
  }
}
