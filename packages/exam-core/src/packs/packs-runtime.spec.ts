import { describe, expect, it } from 'vitest';
import { ExamCrypto } from '../crypto/exam-crypto';
import { buildPack } from './pack-builder';
import { markPackAnswer, markPackSession } from './pack-marking';
import { readPack } from './pack-reader';
import { optionLabel, prepareSessionQuestions } from './pack-shuffle';
import type { BuildPackInput, PackQuestion, PackQuestionKey } from './types';
import { writeZip } from './zip';

const crypto = new ExamCrypto();
const { privateKeyPem } = crypto.generateSigningKeyPair();
const PACK_KEY = new Uint8Array(32).fill(7);

function baseInput(overrides: Partial<BuildPackInput> = {}): BuildPackInput {
  return {
    packId: 'pack-1',
    schoolId: 'school-1',
    examId: 'exam-1',
    version: 1,
    keyVersion: 1,
    builtAt: '2026-10-18T14:02:11.000Z',
    packKey: PACK_KEY,
    signingPrivateKeyPem: privateKeyPem,
    signingKeyId: 'ps-2026-1',
    exam: {
      title: 'JSS 2 Mathematics',
      subject: { id: 'sub-1', name: 'Mathematics' },
      section: 'secondary',
      durationMin: 60,
      instructionsHtml: '<p>Answer all questions.</p>',
      shuffleQuestions: true,
      shuffleOptions: true,
      showScoreToStudent: false,
    },
    questions: [
      {
        questionId: 'q-1',
        position: 1,
        type: 'single_choice',
        stem: '<p>What is 2^3?</p>',
        marks: 2,
        options: [
          { id: 'opt-a', label: 'A', body: '6', sortOrder: 1 },
          { id: 'opt-b', label: 'B', body: '8', sortOrder: 2 },
        ],
        correctOptionIds: ['opt-b'],
      },
      {
        questionId: 'q-2',
        position: 2,
        type: 'multi_choice',
        stem: '<p>Pick the primes.</p>',
        marks: 3,
        options: [
          { id: 'opt-p', label: 'A', body: '2', sortOrder: 1 },
          { id: 'opt-q', label: 'B', body: '4', sortOrder: 2 },
          { id: 'opt-r', label: 'C', body: '5', sortOrder: 3 },
        ],
        correctOptionIds: ['opt-r', 'opt-p'],
      },
      {
        questionId: 'q-3',
        position: 3,
        type: 'fill_blank',
        stem: '<p>The capital of Nigeria is ____.</p>',
        marks: 2,
        fillAnswers: { answers: ['Abuja'], caseSensitive: false },
      },
    ],
    assets: [],
    ...overrides,
  };
}

describe('readPack', () => {
  it('reads the manifest, questions and signature without a pack key', () => {
    const built = buildPack(baseInput());
    const contents = readPack(built.bytes);

    expect(contents.manifest.pack_id).toBe('pack-1');
    expect(contents.manifest.exam.title).toBe('JSS 2 Mathematics');
    expect(contents.questions).toHaveLength(3);
    expect(contents.signature?.alg).toBe('Ed25519');
    expect(contents.keys).toBeUndefined();
    expect(contents.files.has('keys.enc')).toBe(true);
  });

  it('decrypts keys.enc when the pack key is supplied', () => {
    const built = buildPack(baseInput());
    const contents = readPack(built.bytes, { packKey: PACK_KEY });

    expect(contents.keys).toEqual(built.keys);
    expect(contents.keys?.['q-1']).toEqual({
      type: 'single_choice',
      marks: 2,
      correct_option_ids: ['opt-b'],
    });
  });

  it('throws when the archive has no manifest', () => {
    const bytes = writeZip([{ path: 'questions.json', data: new Uint8Array([1]) }]);
    expect(() => readPack(bytes)).toThrow(/manifest\.json/);
  });

  it('throws when the pack key is wrong', () => {
    const built = buildPack(baseInput());
    expect(() => readPack(built.bytes, { packKey: new Uint8Array(32).fill(9) })).toThrow();
  });

  it('opens a pack the validator accepts', () => {
    const built = buildPack(baseInput());
    const contents = readPack(built.bytes, { packKey: PACK_KEY });
    expect(contents.questions.map((question) => question.question_id)).toEqual(['q-1', 'q-2', 'q-3']);
  });
});

describe('markPackAnswer', () => {
  const single: PackQuestionKey = { type: 'single_choice', marks: 2, correct_option_ids: ['opt-b'] };
  const multi: PackQuestionKey = { type: 'multi_choice', marks: 3, correct_option_ids: ['opt-p', 'opt-r'] };
  const fill: PackQuestionKey = {
    type: 'fill_blank',
    marks: 2,
    fill: { answers: ['Abuja'], case_sensitive: false },
  };

  it('scores single choice all-or-nothing', () => {
    expect(markPackAnswer(single, { option_id: 'opt-b' })).toBe(2);
    expect(markPackAnswer(single, { option_id: 'opt-a' })).toBe(0);
    expect(markPackAnswer(single, null)).toBe(0);
  });

  it('treats true_false like single choice', () => {
    const key: PackQuestionKey = { type: 'true_false', marks: 1, correct_option_ids: ['t'] };
    expect(markPackAnswer(key, { option_id: 't' })).toBe(1);
    expect(markPackAnswer(key, { option_id: 'f' })).toBe(0);
  });

  it('requires the exact option set for multi choice', () => {
    expect(markPackAnswer(multi, { option_ids: ['opt-r', 'opt-p'] })).toBe(3);
    expect(markPackAnswer(multi, { option_ids: ['opt-p'] })).toBe(0);
    expect(markPackAnswer(multi, { option_ids: ['opt-p', 'opt-q', 'opt-r'] })).toBe(0);
  });

  it('normalises fill-in-the-blank text', () => {
    expect(markPackAnswer(fill, { text: '  abuja ' })).toBe(2);
    expect(markPackAnswer(fill, { text: 'LAGOS' })).toBe(0);
  });

  it('honours case sensitivity', () => {
    const key: PackQuestionKey = {
      type: 'fill_blank',
      marks: 1,
      fill: { answers: ['Abuja'], case_sensitive: true },
    };
    expect(markPackAnswer(key, { text: 'Abuja' })).toBe(1);
    expect(markPackAnswer(key, { text: 'abuja' })).toBe(0);
  });

  it('marks ordering by exact sequence', () => {
    const key: PackQuestionKey = { type: 'ordering', marks: 3, correct_order: ['a', 'b', 'c'] };
    expect(markPackAnswer(key, { order: ['a', 'b', 'c'] })).toBe(3);
    expect(markPackAnswer(key, { order: ['a', 'c', 'b'] })).toBe(0);
  });

  it('marks matching by exact pair set', () => {
    const key: PackQuestionKey = {
      type: 'matching',
      marks: 2,
      pairs: [
        { left: '1', right: 'one' },
        { left: '2', right: 'two' },
      ],
    };
    expect(
      markPackAnswer(key, {
        pairs: [
          { left: '2', right: 'two' },
          { left: '1', right: 'one' },
        ],
      }),
    ).toBe(2);
    expect(markPackAnswer(key, { pairs: [{ left: '1', right: 'one' }] })).toBe(0);
  });

  it('never scores essays and unanswered questions', () => {
    expect(markPackAnswer({ type: 'essay', marks: 10 }, { text: 'anything' })).toBe(0);
    expect(markPackAnswer(single, null)).toBe(0);
  });

  it('ignores an answer of the wrong shape', () => {
    expect(markPackAnswer(single, { option_ids: ['opt-b'] })).toBe(0);
    expect(markPackAnswer(multi, { option_id: 'opt-p' })).toBe(0);
  });
});

describe('markPackSession', () => {
  it('totals the score, maximum and percentage', () => {
    const built = buildPack(baseInput());
    const result = markPackSession(built.keys, {
      'q-1': { option_id: 'opt-b' },
      'q-2': { option_ids: ['opt-p', 'opt-r'] },
      'q-3': { text: 'Abuja' },
    });

    expect(result.score).toBe(7);
    expect(result.max_score).toBe(7);
    expect(result.percent).toBe(100);
    expect(result.per_question).toHaveLength(3);
  });

  it('counts unanswered questions as zero', () => {
    const built = buildPack(baseInput());
    const result = markPackSession(built.keys, { 'q-1': { option_id: 'opt-b' } });
    expect(result.score).toBe(2);
    expect(result.percent).toBeCloseTo(28.57, 2);
  });
});

describe('prepareSessionQuestions', () => {
  const questions: PackQuestion[] = [
    {
      question_id: 'q-1',
      question_version: 1,
      position: 1,
      type: 'single_choice',
      stem: 'one',
      marks: 1,
      options: [
        { id: 'o1', label: 'A', body: '1' },
        { id: 'o2', label: 'B', body: '2' },
        { id: 'o3', label: 'C', body: '3' },
      ],
      asset_ids: [],
    },
    {
      question_id: 'q-2',
      question_version: 1,
      position: 2,
      type: 'single_choice',
      stem: 'two',
      marks: 1,
      options: [
        { id: 'o4', label: 'A', body: '4' },
        { id: 'o5', label: 'B', body: '5' },
      ],
      asset_ids: [],
    },
    {
      question_id: 'q-3',
      question_version: 1,
      position: 3,
      type: 'true_false',
      stem: 'three',
      marks: 1,
      options: [
        { id: 't', label: 'True', body: 'True' },
        { id: 'f', label: 'False', body: 'False' },
      ],
      asset_ids: [],
    },
  ];

  it('is deterministic for a given seed and varies by seed', () => {
    const first = prepareSessionQuestions(questions, 12345, {
      shuffleQuestions: true,
      shuffleOptions: true,
    });
    const second = prepareSessionQuestions(questions, 12345, {
      shuffleQuestions: true,
      shuffleOptions: true,
    });
    expect(first).toEqual(second);

    const orders = new Set<number>();
    for (let seed = 0; seed < 50; seed += 1) {
      const first = prepareSessionQuestions(questions, seed, {
        shuffleQuestions: true,
        shuffleOptions: false,
      })[0];
      if (first) orders.add(first.position);
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('keeps canonical order when question shuffling is off', () => {
    const ordered = prepareSessionQuestions(questions, 7, {
      shuffleQuestions: false,
      shuffleOptions: false,
    });
    expect(ordered.map((question) => question.question_id)).toEqual(['q-1', 'q-2', 'q-3']);
  });

  it('relabels options A, B, C in display order after shuffling', () => {
    const prepared = prepareSessionQuestions(questions, 999, {
      shuffleQuestions: false,
      shuffleOptions: true,
    });
    for (const question of prepared) {
      expect(question.options.map((option) => option.label)).toEqual(
        question.options.map((_, index) => optionLabel(index)),
      );
    }
  });

  it('never shuffles true_false options', () => {
    const prepared = prepareSessionQuestions(questions, 4, {
      shuffleQuestions: false,
      shuffleOptions: true,
    });
    const trueFalse = prepared.find((question) => question.question_id === 'q-3');
    expect(trueFalse?.options.map((option) => option.id)).toEqual(['t', 'f']);
  });

  it('does not mutate the input questions', () => {
    const before = JSON.stringify(questions);
    prepareSessionQuestions(questions, 1, { shuffleQuestions: true, shuffleOptions: true });
    expect(JSON.stringify(questions)).toBe(before);
  });

  it('labels beyond Z use a spreadsheet scheme', () => {
    expect(optionLabel(0)).toBe('A');
    expect(optionLabel(25)).toBe('Z');
    expect(optionLabel(26)).toBe('AA');
    expect(optionLabel(27)).toBe('AB');
  });
});

describe('pack round trip', () => {
  it('re-reads a built pack and marks a perfect paper', () => {
    const built = buildPack(baseInput());
    const contents = readPack(built.bytes, { packKey: PACK_KEY });

    const answers = Object.fromEntries(
      contents.questions.map((question) => [
        question.question_id,
        question.question_id === 'q-1'
          ? { option_id: 'opt-b' }
          : question.question_id === 'q-2'
            ? { option_ids: ['opt-p', 'opt-r'] }
            : { text: 'Abuja' },
      ]),
    );

    const score = markPackSession(contents.keys!, answers);
    expect(score.score).toBe(score.max_score);
    expect(score.percent).toBe(100);
  });
});
