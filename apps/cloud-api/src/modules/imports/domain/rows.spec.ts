import { describe, expect, it } from 'vitest';
import { parseRows } from './rows';
import type { ImportReferenceData } from './types';

function reference(overrides: Partial<ImportReferenceData> = {}): ImportReferenceData {
  return {
    questionStems: [],
    subjectsByName: new Map([['mathematics', 'sub-1']]),
    levelsByName: new Map([['jss2', 'lvl-1']]),
    classesByName: new Map([['jss2 a', 'class-1']]),
    admissionNos: ['sch-0001'],
    guardiansByPhone: new Map([['2348012345678', 'Grace Obi']]),
    userEmails: ['existing@example.com'],
    ...overrides,
  };
}

describe('parseRows — questions', () => {
  it('accepts a well-formed single-choice row', () => {
    const [row] = parseRows(
      'questions',
      [
        {
          subject: 'Mathematics',
          level: 'JSS2',
          type: 'single_choice',
          question: 'What is 2^3?',
          option_a: '6',
          option_b: '8',
          correct: 'B',
          marks: '1',
          difficulty: 'easy',
        },
      ],
      reference(),
    );
    expect(row!.status).toBe('ok');
    expect(row!.parsed).toMatchObject({ type: 'single_choice', subject_id: 'sub-1', level_id: 'lvl-1' });
    expect((row!.parsed!.options as Array<{ is_correct: boolean }>)[1]!.is_correct).toBe(true);
  });

  it('flags an answer that matches no option', () => {
    const [row] = parseRows(
      'questions',
      [{ subject: 'Mathematics', type: 'single_choice', question: 'Q', option_a: '6', option_b: '8', correct: 'D' }],
      reference(),
    );
    expect(row!.status).toBe('error');
    expect(row!.errors.map((error) => error.code)).toContain('ANSWER_MATCHES_NO_OPTION');
  });

  it('falls back to the upload subject and reports a missing one', () => {
    const [withDefault] = parseRows(
      'questions',
      [{ type: 'fill_blank', question: 'Write 1/2 as a decimal', correct: '0.5|.5' }],
      reference(),
      { subjectId: 'sub-9', levelId: null },
    );
    expect(withDefault!.parsed).toMatchObject({ subject_id: 'sub-9', type: 'fill_blank' });

    const [missing] = parseRows('questions', [{ type: 'fill_blank', question: 'x', correct: 'y' }], reference());
    expect(missing!.errors.map((error) => error.code)).toContain('MISSING_SUBJECT');
  });

  it('warns on likely duplicates', () => {
    const [row] = parseRows(
      'questions',
      [{ subject: 'Mathematics', type: 'true_false', question: 'The sky is blue', correct: 'True' }],
      reference({ questionStems: ['the sky is blue'] }),
    );
    expect(row!.status).toBe('warning');
    expect(row!.errors[0]!.code).toBe('LIKELY_DUPLICATE');
  });
});

describe('parseRows — students, guardians, teachers', () => {
  it('validates a student row and resolves the class', () => {
    const [row] = parseRows(
      'students',
      [{ admission_no: 'SCH-0100', first_name: 'Ada', last_name: 'Obi', gender: 'F', date_of_birth: '12/04/2013', class: 'JSS2 A' }],
      reference(),
    );
    expect(row!.status).toBe('ok');
    expect(row!.parsed).toMatchObject({ class_id: 'class-1', date_of_birth: '2013-04-12' });
  });

  it('rejects a duplicate admission number', () => {
    const [row] = parseRows(
      'students',
      [{ admission_no: 'SCH-0001', first_name: 'Ada', last_name: 'Obi' }],
      reference(),
    );
    expect(row!.errors.map((error) => error.code)).toContain('ALREADY_EXISTS');
  });

  it('warns when a guardian phone already exists', () => {
    const [row] = parseRows(
      'guardians',
      [{ guardian_name: 'Grace Obi', phone: '+2348012345678', child_admission_no: 'SCH-0001' }],
      reference(),
    );
    expect(row!.status).toBe('warning');
    expect(row!.errors[0]!.code).toBe('EXISTING_GUARDIAN');
    expect(row!.parsed).toMatchObject({ child_admission_nos: ['SCH-0001'] });
  });

  it('warns on a duplicate teacher email', () => {
    const [row] = parseRows(
      'teachers',
      [{ full_name: 'Ngozi Okafor', email: 'existing@example.com' }],
      reference(),
    );
    expect(row!.status).toBe('warning');
    expect(row!.errors[0]!.code).toBe('DUPLICATE_EMAIL');
  });
});
