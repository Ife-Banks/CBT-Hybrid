import { describe, expect, it } from 'vitest';
import {
  MarkingEngine,
  mark,
  markFillInBlank,
  markMultipleChoice,
  markSession,
  markSingleChoice,
  percent,
} from './marking-engine';
import type { MarkingKey } from '../answers/types';

describe('single choice (section 4.6 vectors)', () => {
  it('correct -> 2, wrong -> 0, unanswered -> 0', () => {
    expect(markSingleChoice('B', 'B', 2)).toBe(2);
    expect(markSingleChoice('C', 'B', 2)).toBe(0);
    expect(markSingleChoice(null, 'B', 2)).toBe(0);
  });
});

describe('multiple choice (section 4.6 vectors, all-or-nothing)', () => {
  it('exact set -> full marks', () => {
    expect(markMultipleChoice(['C', 'A'], ['A', 'C'], 3)).toBe(3);
  });
  it('subset -> 0', () => {
    expect(markMultipleChoice(['A'], ['A', 'C'], 3)).toBe(0);
  });
  it('extra -> 0', () => {
    expect(markMultipleChoice(['A', 'B', 'C'], ['A', 'C'], 3)).toBe(0);
  });
  it('all wrong -> 0', () => {
    expect(markMultipleChoice(['C'], ['A', 'B'], 3)).toBe(0);
  });
});

describe('fill in the blank (section 4.6 vectors)', () => {
  it('ignores case and trims when case_sensitive is false', () => {
    expect(markFillInBlank('  abuja ', ['Abuja'], false, 2)).toBe(2);
  });
  it('respects case when case_sensitive is true', () => {
    expect(markFillInBlank('abuja', ['Abuja'], true, 2)).toBe(0);
    expect(markFillInBlank('Abuja', ['Abuja'], true, 2)).toBe(2);
  });
  it('collapses inner whitespace', () => {
    expect(markFillInBlank('New   York', ['New York'], false, 2)).toBe(2);
  });
  it('accepts any listed answer', () => {
    expect(markFillInBlank('FCT', ['Abuja', 'FCT'], false, 2)).toBe(2);
  });
});

describe('percent (section 4.6 vectors)', () => {
  it('rounds to two decimals, halves up', () => {
    expect(percent(1, 3)).toBe(33.33);
    expect(percent(2, 3)).toBe(66.67);
    expect(percent(3, 3)).toBe(100);
  });
});

describe('mark / markSession', () => {
  const keys: Record<string, MarkingKey> = {
    q1: { type: 'single_choice', marks: 2, correct_option_ids: ['B'] },
    q2: { type: 'multiple_choice', marks: 3, correct_option_ids: ['A', 'C'] },
    q3: { type: 'fill_blank', marks: 2, accepted_answers: ['Abuja'], case_sensitive: false },
    q4: { type: 'essay', marks: 10 },
  };

  it('marks each question type', () => {
    expect(mark(keys.q1 as MarkingKey, { option_id: 'B' })).toBe(2);
    expect(mark(keys.q2 as MarkingKey, { option_ids: ['C', 'A'] })).toBe(3);
    expect(mark(keys.q3 as MarkingKey, { text: 'abuja ' })).toBe(2);
    expect(mark(keys.q4 as MarkingKey, { text: 'anything' })).toBe(0);
  });

  it('never exceeds the maximum', () => {
    const max = Object.values(keys).reduce((sum, k) => sum + k.marks, 0);
    const total = markSession(keys, {
      q1: { option_id: 'B' },
      q2: { option_ids: ['A', 'C'] },
      q3: { text: 'Abuja' },
      q4: { text: 'long answer' },
    });
    expect(total).toBeLessThanOrEqual(max);
    expect(total).toBe(7);
  });

  it('the MarkingEngine facade matches the functions', () => {
    const engine = new MarkingEngine();
    expect(engine.markSingleChoice('B', 'B', 2)).toBe(2);
    expect(engine.markMultipleChoice(['A', 'C'], ['A', 'C'], 3)).toBe(3);
    expect(engine.markFillInBlank('abuja', ['Abuja'], false, 2)).toBe(2);
    expect(engine.percent(1, 3)).toBe(33.33);
  });
});
