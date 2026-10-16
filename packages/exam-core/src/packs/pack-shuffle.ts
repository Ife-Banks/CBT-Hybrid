import { optionSeed } from '../shuffle/deterministic-shuffler';
import { shuffle } from '../shuffle/deterministic-shuffler';
import type { PackOption, PackQuestion } from './types';

/** Options for {@link prepareSessionQuestions}. */
export interface PrepareSessionOptions {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

/**
 * Spreadsheet-style option label for a zero-based index: `A`, `B` ... `Z`,
 * `AA`, `AB` ... Labels are assigned *after* shuffling and never stored as
 * answers (API spec 14.6).
 */
export function optionLabel(index: number): string {
  let remaining = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return label;
}

/**
 * Deterministic session view of a pack's questions (API spec 14.6):
 *
 * 1. `mulberry32(seed)` drives a Fisher-Yates shuffle of the question list when
 *    `shuffleQuestions` is on.
 * 2. Each question's options are shuffled with `mulberry32(seed ^ hash32(id))`
 *    when `shuffleOptions` is on. `true_false` options are never shuffled.
 * 3. Labels (`A`, `B`, ...) are assigned after shuffling.
 *
 * The same `seed` always yields the same order, which is what session resume
 * relies on.
 */
export function prepareSessionQuestions(
  questions: readonly PackQuestion[],
  seed: number,
  options: PrepareSessionOptions,
): PackQuestion[] {
  const ordered = options.shuffleQuestions ? shuffle(questions, seed) : questions.slice();

  return ordered.map((question) => {
    const shuffleThis = options.shuffleOptions && question.type !== 'true_false';
    const orderedOptions = shuffleThis
      ? shuffle(question.options, optionSeed(seed, question.question_id))
      : question.options.slice();

    const optionsWithLabels: PackOption[] = orderedOptions.map((option, index) => ({
      id: option.id,
      label: optionLabel(index),
      body: option.body,
    }));

    return { ...question, options: optionsWithLabels };
  });
}
