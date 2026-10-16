import { percent } from '../marking/marking-engine';
import type { PackKeys, PackQuestionKey } from './types';

/**
 * The answer a student gave to a pack question (API spec 16.6), or `null` when
 * unanswered. Answers are always keyed by `option_id`, never by label.
 */
export type PackAnswerValue =
  | { option_id: string }
  | { option_ids: string[] }
  | { text: string }
  | { order: string[] }
  | { pairs: Array<{ left: string; right: string }> }
  | null;

/** Normalise fill-in-the-blank text: NFKC, trim, collapse runs, then case-fold. */
function normaliseText(value: string, caseSensitive: boolean): string {
  const collapsed = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return caseSensitive ? collapsed : collapsed.toLowerCase();
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = [...new Set(a)].sort();
  const right = [...new Set(b)].sort();
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

/**
 * Mark one pack answer against its key (API spec 14.5). Pure: the same function
 * scores answers on the school server and in the cloud. Unknown or unanswered
 * questions and essays score `0`; there is no negative marking.
 */
export function markPackAnswer(key: PackQuestionKey, answer: PackAnswerValue): number {
  if (!answer) return 0;

  switch (key.type) {
    case 'single_choice':
    case 'true_false': {
      if (!('option_id' in answer)) return 0;
      return key.correct_option_ids.includes(answer.option_id) ? key.marks : 0;
    }
    case 'multi_choice': {
      if (!('option_ids' in answer)) return 0;
      return sameSet(answer.option_ids, key.correct_option_ids) ? key.marks : 0;
    }
    case 'fill_blank': {
      if (!('text' in answer)) return 0;
      const caseSensitive = key.fill.case_sensitive ?? false;
      const given = normaliseText(answer.text, caseSensitive);
      const matched = key.fill.answers.some(
        (accepted) => normaliseText(accepted, caseSensitive) === given,
      );
      return matched ? key.marks : 0;
    }
    case 'ordering': {
      if (!('order' in answer)) return 0;
      const given = answer.order;
      const correct = key.correct_order;
      const matches =
        given.length === correct.length && given.every((value, index) => value === correct[index]);
      return matches ? key.marks : 0;
    }
    case 'matching': {
      if (!('pairs' in answer)) return 0;
      const same =
        answer.pairs.length === key.pairs.length &&
        key.pairs.every((pair) =>
          answer.pairs.some((given) => given.left === pair.left && given.right === pair.right),
        );
      return same ? key.marks : 0;
    }
    case 'essay':
      return 0;
    default:
      return 0;
  }
}

/** Result of marking a whole session (API spec 14.5). */
export interface PackSessionScore {
  score: number;
  max_score: number;
  percent: number;
  per_question: Array<{ question_id: string; marks: number }>;
}

/**
 * Mark every question in a pack. `answers` is keyed by `question_id`; missing
 * entries count as unanswered. Essays stay unmarked (they score `0`) until a
 * teacher reviews them.
 */
export function markPackSession(
  keys: PackKeys,
  answers: Record<string, PackAnswerValue | undefined>,
): PackSessionScore {
  let score = 0;
  let maxScore = 0;
  const perQuestion: Array<{ question_id: string; marks: number }> = [];

  for (const [questionId, key] of Object.entries(keys)) {
    const marks = markPackAnswer(key, answers[questionId] ?? null);
    score += marks;
    maxScore += key.marks;
    perQuestion.push({ question_id: questionId, marks });
  }

  return {
    score,
    max_score: maxScore,
    percent: percent(score, maxScore),
    per_question: perQuestion,
  };
}
