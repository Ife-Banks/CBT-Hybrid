/** The four question types (API spec 14.5). */
export type QuestionType = 'single_choice' | 'multiple_choice' | 'fill_blank' | 'essay';

/**
 * Answer shapes from API spec 14.5 and 16.6, and the marking key shape.
 * These are defined in `exam-core` (not `shared-types`) so the pure algorithms
 * have no dependency on the schema package. `shared-types` re-exports Zod
 * schemas that validate the same shapes.
 */

export interface SingleChoiceKey {
  type: 'single_choice';
  marks: number;
  correct_option_ids: [string];
}

export interface MultipleChoiceKey {
  type: 'multiple_choice';
  marks: number;
  correct_option_ids: string[];
}

export interface FillBlankKey {
  type: 'fill_blank';
  marks: number;
  accepted_answers: string[];
  case_sensitive?: boolean;
}

export interface EssayKey {
  type: 'essay';
  marks: number;
}

/** Marking key for any question type. */
export type MarkingKey = SingleChoiceKey | MultipleChoiceKey | FillBlankKey | EssayKey;

/** The answer the student gave, or `null` when unanswered. */
export type AnswerValue =
  { option_id: string } | { option_ids: string[] } | { text: string } | null;
