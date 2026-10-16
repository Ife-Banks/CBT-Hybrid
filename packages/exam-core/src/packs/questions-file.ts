import type { PackBuildQuestion, PackOption, PackQuestion } from './types';

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Options in display order: by `sortOrder`, then by id for stability. */
export function orderOptions(
  options: ReadonlyArray<{ id: string; label: string; body: string; sortOrder?: number }>,
): PackOption[] {
  return [...options]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || compareStrings(a.id, b.id))
    .map((option) => ({ id: option.id, label: option.label, body: option.body }));
}

/**
 * Build the `questions.json` array: the questions students see, in canonical
 * order, stripped of every piece of answer-key information.
 */
export function buildQuestionsFile(questions: readonly PackBuildQuestion[]): PackQuestion[] {
  return [...questions]
    .sort((a, b) => a.position - b.position || compareStrings(a.questionId, b.questionId))
    .map((question) => ({
      question_id: question.questionId,
      question_version: question.questionVersion ?? 1,
      position: question.position,
      type: question.type,
      stem: question.stem,
      options: orderOptions(question.options ?? []),
      marks: question.marks,
      asset_ids: [...(question.assetIds ?? [])].sort(compareStrings),
    }));
}
