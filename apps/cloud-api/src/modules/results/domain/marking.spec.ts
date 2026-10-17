import { describe, expect, it } from 'vitest';
import type { PackQuestionKey } from '@cbt/exam-core';
import { keysFromExamQuestions, markSubmission } from './marking';
import type { ExamQuestionKeyInfo } from './types';

function question(
  questionId: string,
  key: PackQuestionKey,
  position = 1,
): ExamQuestionKeyInfo {
  return { questionId, examId: 'exam-1', position, marks: key.marks, key };
}

describe('markSubmission', () => {
  it('scores single choice, multi choice and fill blank questions', () => {
    const questions = [
      question('q1', { type: 'single_choice', marks: 1, correct_option_ids: ['a'] }, 1),
      question('q2', { type: 'multi_choice', marks: 2, correct_option_ids: ['a', 'b'] }, 2),
      question('q3', {
        type: 'fill_blank',
        marks: 3,
        fill: { answers: ['Abuja'], case_sensitive: false },
      }, 3),
      question('q4', { type: 'essay', marks: 5 }, 4),
    ];
    const keys = keysFromExamQuestions(questions);
    const marked = markSubmission(keys, {
      q1: { option_id: 'a' },
      q2: { option_ids: ['b', 'a'] },
      q3: { text: '  abuja ' },
      q4: { text: 'long answer' },
    });

    expect(marked.score).toBe(6);
    expect(marked.max_score).toBe(11);
    expect(marked.percent).toBe(54.55);
    expect(marked.perAnswer).toEqual([
      { questionId: 'q1', marks: 1, maxMarks: 1 },
      { questionId: 'q2', marks: 2, maxMarks: 2 },
      { questionId: 'q3', marks: 3, maxMarks: 3 },
      { questionId: 'q4', marks: 0, maxMarks: 5 },
    ]);
  });

  it('awards nothing for an incorrect multi-choice set', () => {
    const keys = keysFromExamQuestions([
      question('q1', { type: 'multi_choice', marks: 2, correct_option_ids: ['a', 'b'] }),
    ]);
    const marked = markSubmission(keys, { q1: { option_ids: ['a'] } });
    expect(marked.score).toBe(0);
  });

  it('treats unanswered questions as zero', () => {
    const keys = keysFromExamQuestions([
      question('q1', { type: 'single_choice', marks: 1, correct_option_ids: ['a'] }),
    ]);
    const marked = markSubmission(keys, {});
    expect(marked.score).toBe(0);
    expect(marked.max_score).toBe(1);
  });

  it('keeps the last question key when ids repeat', () => {
    const keys = keysFromExamQuestions([
      question('q1', { type: 'single_choice', marks: 1, correct_option_ids: ['a'] }),
      question('q1', { type: 'single_choice', marks: 2, correct_option_ids: ['b'] }),
    ]);
    expect(keys.q1?.marks).toBe(2);
  });
});
