import type { PackQuestionKey } from '@cbt/exam-core';

/** The subset of a question row needed to build its marking key. */
export interface QuestionKeySource {
  type:
    | 'single_choice'
    | 'multi_choice'
    | 'true_false'
    | 'fill_blank'
    | 'essay'
    | 'matching'
    | 'ordering';
  marks: number;
  correctOptionIds?: string[];
  fillAnswers?: string[] | null;
  fillCaseSensitive?: boolean;
  correctOrder?: string[] | null;
  matchingPairs?: Array<{ left: string; right: string }> | null;
}

/**
 * Turn a stored question into the `exam-core` marking key (API spec 14.3). The
 * same shape the pack builder writes into `keys.enc`.
 */
export function buildQuestionKey(source: QuestionKeySource): PackQuestionKey {
  switch (source.type) {
    case 'single_choice':
    case 'true_false':
      return {
        type: source.type,
        marks: source.marks,
        correct_option_ids: source.correctOptionIds ?? [],
      };
    case 'multi_choice':
      return {
        type: 'multi_choice',
        marks: source.marks,
        correct_option_ids: source.correctOptionIds ?? [],
      };
    case 'fill_blank':
      return {
        type: 'fill_blank',
        marks: source.marks,
        fill: {
          answers: source.fillAnswers ?? [],
          case_sensitive: source.fillCaseSensitive ?? false,
        },
      };
    case 'ordering':
      return {
        type: 'ordering',
        marks: source.marks,
        correct_order: source.correctOrder ?? [],
      };
    case 'matching':
      return {
        type: 'matching',
        marks: source.marks,
        pairs: source.matchingPairs ?? [],
      };
    case 'essay':
    default:
      return { type: 'essay', marks: source.marks };
  }
}
