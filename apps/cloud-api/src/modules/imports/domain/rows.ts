import type { ImportDefaults, ImportKind, ImportReferenceData, ParsedRowInput, RowError } from './types';

/** How a row's status is decided from its errors/warnings. */
function statusFor(errors: RowError[]): ParsedRowInput['status'] {
  if (errors.some((error) => !isWarning(error.code))) return 'error';
  if (errors.length > 0) return 'warning';
  return 'ok';
}

const WARNING_CODES = new Set(['LIKELY_DUPLICATE', 'EXISTING_GUARDIAN', 'DUPLICATE_EMAIL']);

function isWarning(code: string): boolean {
  return WARNING_CODES.has(code);
}

function err(field: string, code: string, message: string): RowError {
  return { field, code, message };
}

function warn(field: string, code: string, message: string): RowError {
  return { field, code, message };
}

/** Parse every raw row of a job into a validated row (spec 7.3). */
export function parseRows(
  kind: ImportKind,
  rawRows: Array<Record<string, string>>,
  reference: ImportReferenceData,
  defaults: ImportDefaults = { subjectId: null, levelId: null },
): ParsedRowInput[] {
  const seen = new Set<string>();
  return rawRows.map((raw, index) => {
    const rowNo = index + 1;
    const { parsed, errors } =
      kind === 'questions'
        ? parseQuestionRow(raw, reference, defaults)
        : kind === 'students'
          ? parseStudentRow(raw, reference, seen)
          : kind === 'guardians'
            ? parseGuardianRow(raw, reference)
            : parseTeacherRow(raw, reference, seen);
    return { rowNo, status: statusFor(errors), raw, parsed, errors };
  });
}

// --- Questions (spec 7.2 / 9.1) -------------------------------------------

const QUESTION_TYPE_ALIASES: Record<string, string> = {
  single_choice: 'single_choice',
  single: 'single_choice',
  mcq: 'single_choice',
  multi_choice: 'multi_choice',
  multiple: 'multi_choice',
  multi: 'multi_choice',
  true_false: 'true_false',
  tf: 'true_false',
  'true/false': 'true_false',
  fill_blank: 'fill_blank',
  fill: 'fill_blank',
  blank: 'fill_blank',
};

function parseQuestionRow(
  raw: Record<string, string>,
  reference: ImportReferenceData,
  defaults: ImportDefaults,
): { parsed: Record<string, unknown> | null; errors: RowError[] } {
  const errors: RowError[] = [];
  const stem = (raw.question ?? '').trim();
  if (!stem) errors.push(err('question', 'MISSING_QUESTION', 'A question stem is required.'));

  const options: Array<{ label: string; body: string; is_correct: boolean }> = [];
  for (const letter of ['a', 'b', 'c', 'd', 'e', 'f']) {
    const body = (raw[`option_${letter}`] ?? '').trim();
    if (body) options.push({ label: letter.toUpperCase(), body, is_correct: false });
  }

  const requestedType = (raw.type ?? '').trim().toLowerCase();
  let type = QUESTION_TYPE_ALIASES[requestedType] ?? '';
  if (!type) {
    if (options.length >= 2) type = (raw.correct ?? '').includes(',') ? 'multi_choice' : 'single_choice';
    else if ((raw.correct ?? '').trim()) type = 'fill_blank';
  }
  if (!type) {
    errors.push(err('type', 'UNSUPPORTED_TYPE', 'The question type could not be determined.'));
  }
  if (requestedType && !QUESTION_TYPE_ALIASES[requestedType]) {
    errors.push(err('type', 'UNSUPPORTED_TYPE', `Unknown question type "${raw.type}".`));
  }

  const correct = (raw.correct ?? '').trim();
  let fillAnswers: { answers: string[]; case_sensitive: boolean } | null = null;

  if (type === 'single_choice' || type === 'multi_choice') {
    if (options.length < 2) {
      errors.push(err('correct', 'TOO_FEW_OPTIONS', 'A choice question needs at least two options.'));
    }
    const bodies = options.map((option) => option.body.toLowerCase());
    if (new Set(bodies).size !== bodies.length) {
      errors.push(err('correct', 'DUPLICATE_OPTIONS', 'Two options have the same text.'));
    }
    const letters = correct
      .split(/[,\s]+/)
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean);
    if (letters.length === 0) {
      errors.push(err('correct', 'MISSING_ANSWER', 'The correct option letter(s) are required.'));
    } else {
      for (const letter of letters) {
        const option = options.find((candidate) => candidate.label === letter);
        if (!option) {
          errors.push(
            err('correct', 'ANSWER_MATCHES_NO_OPTION', `Answer "${letter}" matches no option.`),
          );
        } else {
          option.is_correct = true;
        }
      }
      if (type === 'single_choice' && letters.length > 1) {
        errors.push(err('correct', 'MULTIPLE_ANSWERS', 'A single-choice question has one answer.'));
      }
    }
  } else if (type === 'true_false') {
    if (!/^(true|false|t|f)$/i.test(correct)) {
      errors.push(err('correct', 'MISSING_ANSWER', 'The answer must be True or False.'));
    }
  } else if (type === 'fill_blank') {
    const answers = correct
      .split('|')
      .map((answer) => answer.trim())
      .filter(Boolean);
    if (answers.length === 0) {
      errors.push(err('correct', 'MISSING_ANSWER', 'At least one accepted answer is required.'));
    }
    fillAnswers = {
      answers,
      case_sensitive: /^(y|yes|true|1)$/i.test((raw.case_sensitive ?? '').trim()),
    };
  }

  // Images live in a companion archive we do not ingest yet.
  if ((raw.image ?? '').trim()) {
    errors.push(err('image', 'IMAGE_NOT_FOUND', `Image "${raw.image}" was not uploaded.`));
  }

  const marks = Number((raw.marks ?? '').trim() || '1');
  if (!Number.isFinite(marks) || marks <= 0 || marks > 20) {
    errors.push(err('marks', 'MARKS_INVALID', 'Marks must be between 0.5 and 20.'));
  }

  if (reference.questionStems.includes(stem.trim().toLowerCase())) {
    errors.push(warn('question', 'LIKELY_DUPLICATE', 'A question with this text already exists.'));
  }

  const subjectName = (raw.subject ?? '').trim();
  let subjectId = defaults.subjectId;
  if (subjectName) {
    const match = reference.subjectsByName.get(subjectName.toLowerCase());
    if (!match) errors.push(err('subject', 'UNKNOWN_SUBJECT', `No subject named "${subjectName}".`));
    else subjectId = match;
  }
  if (!subjectId) errors.push(err('subject', 'MISSING_SUBJECT', 'Choose a subject for this question.'));

  const levelName = (raw.level ?? '').trim();
  let levelId = defaults.levelId;
  if (levelName) {
    const match = reference.levelsByName.get(levelName.toLowerCase());
    if (!match) errors.push(err('level', 'UNKNOWN_LEVEL', `No level named "${levelName}".`));
    else levelId = match;
  }

  const parsed = {
    type: type || null,
    stem,
    options: options.map((option) => ({
      label: option.label,
      body: option.body,
      is_correct: option.is_correct,
    })),
    fill_answers: fillAnswers,
    marks: Number.isFinite(marks) ? marks : 1,
    difficulty: normalizeDifficulty(raw.difficulty),
    topic: (raw.topic ?? '').trim() || null,
    explanation: (raw.explanation ?? '').trim() || null,
    subject_id: subjectId ?? null,
    subject_name: subjectName || null,
    level_id: levelId ?? null,
    level_name: levelName || null,
  };

  return { parsed, errors };
}

function normalizeDifficulty(value: string | undefined): string | null {
  const normalized = (value ?? '').trim().toLowerCase();
  return ['easy', 'medium', 'hard'].includes(normalized) ? normalized : null;
}

// --- Students (spec 9.3) --------------------------------------------------

function parseStudentRow(
  raw: Record<string, string>,
  reference: ImportReferenceData,
  seen: Set<string>,
): { parsed: Record<string, unknown> | null; errors: RowError[] } {
  const errors: RowError[] = [];
  const admissionNo = (raw.admission_no ?? '').trim();
  const firstName = (raw.first_name ?? '').trim();
  const lastName = (raw.last_name ?? '').trim();

  if (!admissionNo) errors.push(err('admission_no', 'MISSING_ADMISSION_NO', 'Admission number is required.'));
  if (!firstName) errors.push(err('first_name', 'MISSING_FIRST_NAME', 'First name is required.'));
  if (!lastName) errors.push(err('last_name', 'MISSING_LAST_NAME', 'Last name is required.'));

  const key = admissionNo.toLowerCase();
  if (admissionNo) {
    if (seen.has(key)) {
      errors.push(err('admission_no', 'DUPLICATE_IN_FILE', 'This admission number appears twice.'));
    } else if (reference.admissionNos.includes(key)) {
      errors.push(err('admission_no', 'ALREADY_EXISTS', 'A student with this admission number exists.'));
    }
    seen.add(key);
  }

  const gender = (raw.gender ?? '').trim().toUpperCase();
  if (gender && !['M', 'F'].includes(gender)) {
    errors.push(err('gender', 'INVALID_GENDER', 'Gender must be M or F.'));
  }

  const dateOfBirth = parseDate(raw.date_of_birth ?? '');
  if ((raw.date_of_birth ?? '').trim() && !dateOfBirth) {
    errors.push(err('date_of_birth', 'INVALID_DATE', 'Date of birth must be a valid date.'));
  }

  const className = (raw.class ?? '').trim();
  const classId = className ? reference.classesByName.get(className.toLowerCase()) : undefined;
  if (className && !classId) {
    errors.push(err('class', 'UNKNOWN_CLASS', `No class named "${className}".`));
  }

  const parsed = {
    admission_no: admissionNo,
    first_name: firstName,
    last_name: lastName,
    other_names: (raw.other_names ?? '').trim() || null,
    gender: gender || null,
    date_of_birth: dateOfBirth,
    class_id: classId ?? null,
    class_name: className || null,
  };

  return { parsed, errors };
}

function parseDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return trimmed;
  const dmy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(trimmed);
  if (dmy) {
    const [, day, month, year] = dmy;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

// --- Guardians (spec 9.4) -------------------------------------------------

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

function parseGuardianRow(
  raw: Record<string, string>,
  reference: ImportReferenceData,
): { parsed: Record<string, unknown> | null; errors: RowError[] } {
  const errors: RowError[] = [];
  const fullName = (raw.guardian_name ?? '').trim();
  const phone = normalizePhone(raw.phone ?? '');
  const email = (raw.email ?? '').trim();

  if (!fullName) errors.push(err('guardian_name', 'MISSING_NAME', 'Guardian name is required.'));
  if (!phone && !email) {
    errors.push(err('phone', 'MISSING_CONTACT', 'A phone number or email is required.'));
  }

  const children = (raw.child_admission_no ?? '')
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (children.length === 0) {
    errors.push(err('child_admission_no', 'MISSING_CHILD', 'At least one child admission number is required.'));
  }

  if (phone && reference.guardiansByPhone.has(phone.replace(/^\+/, ''))) {
    errors.push(
      warn(
        'phone',
        'EXISTING_GUARDIAN',
        `A guardian with this phone already exists (${reference.guardiansByPhone.get(
          phone.replace(/^\+/, ''),
        )}).`,
      ),
    );
  }

  const parsed = {
    full_name: fullName,
    phone_e164: phone || null,
    email: email || null,
    relationship: (raw.relationship ?? '').trim() || null,
    child_admission_nos: children,
    can_view_results: !/^(n|no|false|0)$/i.test((raw.can_view_results ?? '').trim()),
  };

  return { parsed, errors };
}

// --- Teachers (spec 9.5) --------------------------------------------------

function parseTeacherRow(
  raw: Record<string, string>,
  reference: ImportReferenceData,
  seen: Set<string>,
): { parsed: Record<string, unknown> | null; errors: RowError[] } {
  const errors: RowError[] = [];
  const fullName = (raw.full_name ?? '').trim();
  const email = (raw.email ?? '').trim().toLowerCase();

  if (!fullName) errors.push(err('full_name', 'MISSING_NAME', 'Full name is required.'));
  if (!email) errors.push(err('email', 'MISSING_EMAIL', 'Email is required.'));
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    errors.push(err('email', 'INVALID_EMAIL', 'Enter a valid email address.'));
  } else if (seen.has(email)) {
    errors.push(err('email', 'DUPLICATE_IN_FILE', 'This email appears twice.'));
  } else if (reference.userEmails.includes(email)) {
    errors.push(warn('email', 'DUPLICATE_EMAIL', 'A user with this email already exists.'));
  }
  if (email) seen.add(email);

  const parsed = {
    full_name: fullName,
    email: email || null,
    phone_e164: normalizePhone(raw.phone ?? '') || null,
    staff_no: (raw.staff_no ?? '').trim() || null,
  };

  return { parsed, errors };
}
