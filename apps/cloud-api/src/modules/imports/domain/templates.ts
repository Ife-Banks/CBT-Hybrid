import type { ImportFormat, ImportKind } from './types';

/** Accepted formats per kind (spec 7.3). Word is questions-only. */
export const IMPORT_FORMATS: Record<ImportKind, ImportFormat[]> = {
  questions: ['xlsx', 'csv', 'docx'],
  students: ['xlsx', 'csv'],
  guardians: ['xlsx', 'csv'],
  teachers: ['xlsx', 'csv'],
};

/** Column order used by the generated templates (spec 9). */
export const TEMPLATE_COLUMNS: Record<ImportKind, string[]> = {
  questions: [
    'subject',
    'level',
    'topic',
    'type',
    'question',
    'option_a',
    'option_b',
    'option_c',
    'option_d',
    'option_e',
    'option_f',
    'correct',
    'marks',
    'difficulty',
    'explanation',
    'image',
    'case_sensitive',
  ],
  students: [
    'admission_no',
    'first_name',
    'last_name',
    'other_names',
    'gender',
    'date_of_birth',
    'class',
  ],
  guardians: [
    'guardian_name',
    'phone',
    'email',
    'relationship',
    'child_admission_no',
    'can_view_results',
  ],
  teachers: ['full_name', 'email', 'phone', 'staff_no'],
};

/** One or two example rows shown in the template (spec section 9). */
export const TEMPLATE_EXAMPLES: Record<ImportKind, string[][]> = {
  questions: [
    [
      'Mathematics',
      'JSS2',
      'Indices',
      'single_choice',
      'What is $2^3$?',
      '6',
      '8',
      '9',
      '',
      '',
      '',
      'B',
      '1',
      'easy',
      '2 x 2 x 2 = 8',
      '',
      '',
    ],
    [
      '',
      '',
      'Fractions',
      'fill_blank',
      'Write 1/2 as a decimal',
      '',
      '',
      '',
      '',
      '',
      '',
      '0.5|.5',
      '1',
      'medium',
      '',
      '',
      'no',
    ],
  ],
  students: [
    ['SCH-0001', 'Ada', 'Obi', '', 'F', '2013-04-12', 'JSS2 A'],
    ['SCH-0002', 'Chidi', 'Eze', 'Emeka', 'M', '2012-09-01', 'JSS2 A'],
  ],
  guardians: [
    ['Grace Obi', '+2348012345678', 'grace@example.com', 'mother', 'SCH-0001', 'yes'],
    ['Paul Eze', '+2348087654321', '', 'father', 'SCH-0002;SCH-0003', 'yes'],
  ],
  teachers: [
    ['Ngozi Okafor', 'ngozi@example.com', '+2348011112222', 'STF-100'],
  ],
};

/** Map a requested kind+format to the stored job kind. */
export function storedKind(kind: ImportKind, format: ImportFormat): string {
  if (kind === 'questions' && format === 'docx') return 'questions_docx';
  if (kind === 'questions') return 'questions_xlsx';
  return kind;
}

/** The downloadable template file name. */
export function templateFileName(kind: ImportKind, format: ImportFormat): string {
  return `${kind}-template.${format}`;
}
