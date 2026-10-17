import {
  markPackSession,
  type PackAnswerValue,
  type PackQuestionKey,
  type PackSessionScore,
} from '@cbt/exam-core';
import type { ExamQuestionKeyInfo } from './types';

export interface MarkedAnswer {
  questionId: string;
  marks: number;
  maxMarks: number;
}

export interface MarkedSubmission extends PackSessionScore {
  perAnswer: MarkedAnswer[];
}

/** Build the `exam-core` key map for an exam's questions (last wins). */
export function keysFromExamQuestions(
  questions: readonly ExamQuestionKeyInfo[],
): Record<string, PackQuestionKey> {
  const keys: Record<string, PackQuestionKey> = {};
  for (const question of questions) keys[question.questionId] = question.key;
  return keys;
}

/**
 * Re-mark a submission with the shared `exam-core` engine (API spec 14.5). The
 * same pure function scores on the school server and in the cloud; the cloud
 * keeps its own computed marks and compares them to the school's totals.
 */
export function markSubmission(
  keys: Record<string, PackQuestionKey>,
  answers: Record<string, PackAnswerValue | undefined>,
): MarkedSubmission {
  const marked = markPackSession(keys, answers);
  const perAnswer: MarkedAnswer[] = marked.per_question.map((question) => ({
    questionId: question.question_id,
    marks: question.marks,
    maxMarks: keys[question.question_id]?.marks ?? 0,
  }));
  return { ...marked, perAnswer };
}
