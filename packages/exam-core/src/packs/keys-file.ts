import type {
  PackBuildQuestion,
  PackKeys,
  PackQuestionKey,
} from './types';

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function keyForQuestion(question: PackBuildQuestion): PackQuestionKey {
  switch (question.type) {
    case 'single_choice':
    case 'true_false': {
      const ids = [...(question.correctOptionIds ?? [])].sort(compareStrings);
      if (ids.length === 0) {
        throw new Error(`Question ${question.questionId} has no correct option`);
      }
      return { type: question.type, marks: question.marks, correct_option_ids: ids };
    }
    case 'multi_choice': {
      const ids = [...(question.correctOptionIds ?? [])].sort(compareStrings);
      if (ids.length === 0) {
        throw new Error(`Question ${question.questionId} has no correct options`);
      }
      return { type: 'multi_choice', marks: question.marks, correct_option_ids: ids };
    }
    case 'fill_blank': {
      const answers = question.fillAnswers?.answers ?? [];
      if (answers.length === 0) {
        throw new Error(`Question ${question.questionId} has no accepted answers`);
      }
      return {
        type: 'fill_blank',
        marks: question.marks,
        fill: {
          answers: [...answers].sort(compareStrings),
          case_sensitive: question.fillAnswers?.caseSensitive ?? false,
        },
      };
    }
    case 'essay':
      return { type: 'essay', marks: question.marks };
    case 'ordering': {
      const order = [...(question.correctOrder ?? [])];
      if (order.length === 0) {
        throw new Error(`Question ${question.questionId} has no correct order`);
      }
      return { type: 'ordering', marks: question.marks, correct_order: order };
    }
    case 'matching': {
      const pairs = question.matchingPairs ?? [];
      if (pairs.length === 0) {
        throw new Error(`Question ${question.questionId} has no matching pairs`);
      }
      return { type: 'matching', marks: question.marks, pairs };
    }
  }
}

/**
 * Build the `keys.enc` payload: the marking key for every question. The caller
 * encrypts and packs this; it never appears in the clear inside a pack.
 */
export function buildKeysFile(questions: readonly PackBuildQuestion[]): PackKeys {
  const keys: PackKeys = {};
  for (const question of questions) {
    keys[question.questionId] = keyForQuestion(question);
  }
  return keys;
}
