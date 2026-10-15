import type { AnswerValue, MarkingKey } from '../answers/types';

/** Round to two decimal places, halves rounded up. */
export function percent(score: number, max: number): number {
  if (max <= 0) return 0;
  const raw = (score / max) * 100;
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}

/** Trim and collapse runs of whitespace, for fill-in-the-blank comparison. */
function normaliseText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Single choice (all-or-nothing). Returns `marks` when the chosen option equals
 * the correct option, otherwise `0` (CBT-04 section 4.6).
 */
export function markSingleChoice(
  answer: string | null | undefined,
  correctAnswer: string | null | undefined,
  marks = 2,
): number {
  if (!answer || !correctAnswer) return 0;
  return answer === correctAnswer ? marks : 0;
}

/**
 * Multiple choice is **all-or-nothing**: the answer set must equal the correct
 * set exactly. A subset or a superset scores `0` (CBT-04 section 4.6).
 */
export function markMultipleChoice(
  answers: readonly string[] | null | undefined,
  correctAnswers: readonly string[] | null | undefined,
  marks = 3,
): number {
  if (!answers || !correctAnswers || correctAnswers.length === 0) return 0;
  const given = [...new Set(answers)].sort();
  const correct = [...new Set(correctAnswers)].sort();
  if (given.length !== correct.length) return 0;
  for (let i = 0; i < given.length; i += 1) {
    if (given[i] !== correct[i]) return 0;
  }
  return marks;
}

/**
 * Fill in the blank. Whitespace is normalised (trim + collapse inner runs). When
 * `caseSensitive` is false the comparison is case-insensitive
 * (CBT-04 section 4.6).
 */
export function markFillInBlank(
  answer: string | null | undefined,
  acceptedAnswers: readonly string[] | null | undefined,
  caseSensitive = false,
  marks = 2,
): number {
  if (answer == null || !acceptedAnswers || acceptedAnswers.length === 0) return 0;
  const given = normaliseText(answer);
  for (const accepted of acceptedAnswers) {
    const candidate = normaliseText(accepted);
    const matches = caseSensitive
      ? given === candidate
      : given.toLowerCase() === candidate.toLowerCase();
    if (matches) return marks;
  }
  return 0;
}

/** Mark one answer against its key. Unknown or essay questions score 0. */
export function mark(key: MarkingKey, answer: AnswerValue): number {
  switch (key.type) {
    case 'single_choice':
      return markSingleChoice(
        isSingleAnswer(answer) ? answer.option_id : null,
        key.correct_option_ids?.[0],
        key.marks,
      );
    case 'multiple_choice':
      return markMultipleChoice(
        isMultiAnswer(answer) ? answer.option_ids : null,
        key.correct_option_ids,
        key.marks,
      );
    case 'fill_blank':
      return markFillInBlank(
        isTextAnswer(answer) ? answer.text : null,
        key.accepted_answers,
        key.case_sensitive ?? false,
        key.marks,
      );
    case 'essay':
      return 0;
    default:
      return 0;
  }
}

/** Total score for a session. */
export function markSession(
  keys: Record<string, MarkingKey>,
  answers: Record<string, AnswerValue | undefined>,
): number {
  let score = 0;
  for (const [questionId, key] of Object.entries(keys)) {
    score += mark(key, answers[questionId] ?? null);
  }
  return score;
}

function isSingleAnswer(answer: AnswerValue): answer is { option_id: string } {
  return typeof answer === 'object' && answer !== null && 'option_id' in answer;
}
function isMultiAnswer(answer: AnswerValue): answer is { option_ids: string[] } {
  return typeof answer === 'object' && answer !== null && 'option_ids' in answer;
}
function isTextAnswer(answer: AnswerValue): answer is { text: string } {
  return typeof answer === 'object' && answer !== null && 'text' in answer;
}

/** Convenience facade mirroring the names used in the build specification. */
export class MarkingEngine {
  markSingleChoice(...args: Parameters<typeof markSingleChoice>): number {
    return markSingleChoice(...args);
  }
  markMultipleChoice(...args: Parameters<typeof markMultipleChoice>): number {
    return markMultipleChoice(...args);
  }
  markFillInBlank(...args: Parameters<typeof markFillInBlank>): number {
    return markFillInBlank(...args);
  }
  mark(key: MarkingKey, answer: AnswerValue): number {
    return mark(key, answer);
  }
  markSession(
    keys: Record<string, MarkingKey>,
    answers: Record<string, AnswerValue | undefined>,
  ): number {
    return markSession(keys, answers);
  }
  percent(score: number, max: number): number {
    return percent(score, max);
  }
}
