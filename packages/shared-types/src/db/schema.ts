import { pgTable, text, timestamp, integer, boolean, pgEnum, index, unique, jsonb, primaryKey, numeric } from 'drizzle-orm/pg-core';
import { sql, eq } from 'drizzle-orm';

// Enums - aligned with Phase 2 domain types
export const userRoleEnum = pgEnum('user_role', ['platform_owner', 'school_admin', 'teacher', 'invigilator', 'parent', 'student']);
export const userStatusEnum = pgEnum('user_status', ['invited', 'active', 'suspended', 'deactivated']);
export const otpPurposeEnum = pgEnum('otp_purpose', ['password_reset', 'guardian_email']);
export const invitationKindEnum = pgEnum('invitation_kind', ['staff', 'guardian', 'password_reset']);
export const invitationStatusEnum = pgEnum('invitation_status', ['pending', 'sent', 'used', 'expired', 'revoked', 'failed']);
export const invitationChannelEnum = pgEnum('invitation_channel', ['email', 'sms', 'whatsapp', 'printed', 'manual_link']);

// Phase 5: Question Bank Enums
export const questionTypeEnum = pgEnum('question_type', ['single_choice', 'multi_choice', 'true_false', 'fill_blank', 'essay', 'matching', 'ordering']);
export const questionDifficultyEnum = pgEnum('question_difficulty', ['easy', 'medium', 'hard']);
export const questionStatusEnum = pgEnum('question_status', ['draft', 'approved', 'retired']);
export const levelSectionEnum = pgEnum('level_section', ['nursery', 'primary', 'secondary']);
export const subjectSectionEnum = pgEnum('subject_section', ['primary', 'secondary', 'both']);

// Phase 5B: Additional Enums
export const assetTypeEnum = pgEnum('asset_type', ['image', 'audio', 'video', 'document']);
export const importJobKindEnum = pgEnum('import_job_kind', ['word', 'excel', 'csv', 'json']);
export const importJobStatusEnum = pgEnum('import_job_status', ['pending', 'processing', 'completed', 'failed', 'cancelled']);

// Phase 6: Exam Engine Enums
export const examKindEnum = pgEnum('exam_kind', ['test', 'exam', 'practice', 'quiz']);
export const examStatusEnum = pgEnum('exam_status', ['draft', 'ready', 'published', 'archived']);
export const sittingStatusEnum = pgEnum('sitting_status', ['scheduled', 'open', 'closed', 'cancelled']);

// Phase 9: Results & Analytics Enums
export const resultStatusEnum = pgEnum('result_status', ['draft', 'reviewed', 'released', 'withdrawn']);
export const submissionStatusEnum = pgEnum('submission_status', ['active', 'voided']);
export const remarkRunStatusEnum = pgEnum('remark_run_status', ['previewed', 'applied', 'cancelled']);
export const notificationChannelEnum = pgEnum('notification_channel', ['email', 'sms', 'whatsapp', 'in_app']);
export const notificationStatusEnum = pgEnum('notification_status', ['queued', 'sent', 'failed']);

// Phase 9B: Audit log (API spec 11.4, US-16.1)
export const auditOutcomeEnum = pgEnum('audit_outcome', ['success', 'failure']);

// Schools table
export const schools = pgTable('schools', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  address: text('address'),
  logoAssetId: text('logo_asset_id'),
  timezone: text('timezone').notNull().default('Africa/Lagos'),
  gradeScaleId: text('grade_scale_id'),
  status: text('status').notNull().default('active'),
  licenceExpires: timestamp('licence_expires', { withTimezone: true }),
  maxStudents: integer('max_students').default(1000),
  settings: jsonb('settings').default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('idx_schools_status').on(table.status),
  expiryIdx: index('idx_schools_expiry').on(table.licenceExpires),
}));

// Users table - aligned with Phase 2 UserRecord
export const users = pgTable('users', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').references(() => schools.id, { onDelete: 'restrict' }),
  role: userRoleEnum('role').notNull(),
  fullName: text('full_name').notNull(),
  email: text('email'),
  phoneE164: text('phone_e164'),
  passwordHash: text('password_hash').notNull(),
  status: userStatusEnum('status').notNull().default('invited'),
  totpSecret: text('totp_secret'),
  recoveryCodeHashes: jsonb('recovery_code_hashes').$type<string[]>(),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  preferences: jsonb('preferences').default(sql`'{}'::jsonb`),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  schoolEmailIdx: unique('idx_users_school_email').on(table.schoolId, table.email),
  schoolPhoneIdx: unique('idx_users_school_phone').on(table.schoolId, table.phoneE164),
  schoolRoleIdx: index('idx_users_school_role').on(table.schoolId, table.role),
  lockedIdx: index('idx_users_locked').on(table.lockedUntil),
}));

// Sessions table
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  deviceName: text('device_name'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  sliding: boolean('sliding').default(false),
}, (table) => ({
  userIdx: index('idx_sessions_user').on(table.userId, table.createdAt),
  expiresIdx: index('idx_sessions_expires').on(table.expiresAt),
  tokenIdx: index('idx_sessions_token').on(table.tokenHash),
}));

// OTP Challenges table - aligned with Phase 2 OtpChallengeRecord
export const otpChallenges = pgTable('otp_challenges', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  invitationId: text('invitation_id'),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  purpose: otpPurposeEnum('purpose').notNull(),
  sentTo: text('sent_to').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  lookupIdx: index('idx_otp_challenges_lookup').on(table.id, table.codeHash),
  cleanupIdx: index('idx_otp_cleanup').on(table.expiresAt),
}));

// Teacher Profiles table
export const teacherProfiles = pgTable('teacher_profiles', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  staffNo: text('staff_no'),
  title: text('title'),
  department: text('department'),
  qualifications: text('qualifications'),
  joinedDate: timestamp('joined_date', { withTimezone: true }),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
}, (table) => ({
  staffNoIdx: index('idx_teacher_profiles_staff_no').on(table.staffNo),
}));

// Invitations table
export const invitations = pgTable('invitations', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  kind: invitationKindEnum('kind').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  guardianId: text('guardian_id'),
  tokenHash: text('token_hash').notNull().unique(),
  channel: invitationChannelEnum('channel').notNull(),
  sentTo: text('sent_to'),
  status: invitationStatusEnum('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  schoolStatusIdx: index('idx_invitations_school_status').on(table.schoolId, table.status, table.createdAt),
  tokenIdx: index('idx_invitations_token').on(table.tokenHash),
  expiresIdx: index('idx_invitations_expires').on(table.expiresAt),
  guardianIdx: index('idx_invitations_guardian').on(table.guardianId),
}));

// Students table
export const students = pgTable('students', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  admissionNo: text('admission_no').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  otherNames: text('other_names'),
  gender: text('gender'),
  dateOfBirth: timestamp('date_of_birth', { withTimezone: true }),
  photoAssetId: text('photo_asset_id'),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  schoolAdmissionUnique: unique('idx_students_school_admission').on(table.schoolId, table.admissionNo),
  schoolStatusIdx: index('idx_students_school_status').on(table.schoolId, table.status),
}));

// Student Codes table
export const studentCodes = pgTable('student_codes', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  status: text('status').notNull().default('active'),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  reason: text('reason'),
  issuedBy: text('issued_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  studentIdx: index('idx_student_codes_student').on(table.studentId, table.issuedAt),
}));

// Guardians table
export const guardians = pgTable('guardians', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  userId: text('user_id').unique().references(() => users.id, { onDelete: 'set null' }),
  fullName: text('full_name').notNull(),
  email: text('email'),
  phoneE164: text('phone_e164'),
  relationship: text('relationship'),
  // Parent notification channel preferences (US-12.6): `{ email, sms, whatsapp, in_app }`.
  notificationPrefs: jsonb('notification_prefs')
    .$type<{ email?: boolean; sms?: boolean; whatsapp?: boolean; inApp?: boolean }>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  schoolPhoneUnique: unique('idx_guardians_school_phone').on(table.schoolId, table.phoneE164),
  userIdx: index('idx_guardians_user').on(table.userId),
}));

// Guardianships link table
export const guardianships = pgTable('guardianships', {
  guardianId: text('guardian_id').notNull().references(() => guardians.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  relationship: text('relationship'),
  canViewResults: boolean('can_view_results').notNull().default(true),
  canPayFees: boolean('can_pay_fees').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.guardianId, table.studentId] }),
  studentIdx: index('idx_guardianships_student').on(table.studentId),
  guardianActiveIdx: index('idx_guardianships_guardian_active').on(table.guardianId),
}));

// Phase 5: Question Bank Tables

// Subjects table
export const subjects = pgTable('subjects', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  code: text('code'),
  section: subjectSectionEnum('section'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  schoolNameUnique: unique('idx_subjects_school_name').on(table.schoolId, table.name),
}));

// Levels table
export const levels = pgTable('levels', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  section: levelSectionEnum('section'),
  sortOrder: integer('sort_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  schoolNameUnique: unique('idx_levels_school_name').on(table.schoolId, table.name),
  schoolSectionSortIdx: index('idx_levels_school_section').on(table.schoolId, table.section, table.sortOrder),
}));

// Questions table
export const questions = pgTable('questions', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  subjectId: text('subject_id').notNull().references(() => subjects.id, { onDelete: 'restrict' }),
  levelId: text('level_id').references(() => levels.id, { onDelete: 'set null' }),
  type: questionTypeEnum('type').notNull(),
  stem: text('stem').notNull(),
  explanation: text('explanation'),
  marks: numeric('marks', { precision: 5, scale: 2 }).notNull().default('1'),
  difficulty: questionDifficultyEnum('difficulty'),
  topic: text('topic'),
  tags: text('tags').array(),
  fillAnswers: jsonb('fill_answers'),
  matchingPairs: jsonb('matching_pairs'), // For matching questions: [{left, right}, ...]
  correctOrder: jsonb('correct_order'), // For ordering questions: ['item1', 'item2', ...]
  status: questionStatusEnum('status').notNull().default('draft'),
  supersedesId: text('supersedes_id'),
  version: integer('version').notNull().default(1),
  usageCount: integer('usage_count').notNull().default(0),
  createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  approvedBy: text('approved_by').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  importRowId: text('import_row_id'),
}, (table) => ({
  schoolSubjectStatusIdx: index('idx_questions_school_subject').on(table.schoolId, table.subjectId, table.status),
  levelIdx: index('idx_questions_level').on(table.levelId),
  topicIdx: index('idx_questions_topic').on(table.schoolId, table.topic),
  difficultyIdx: index('idx_questions_difficulty').on(table.difficulty),
  creatorIdx: index('idx_questions_creator').on(table.createdBy, table.status),
  supersedesIdx: index('idx_questions_supersedes').on(table.supersedesId),
}));

// Question Options table
export const questionOptions = pgTable('question_options', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  questionId: text('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  body: text('body').notNull(),
  isCorrect: boolean('is_correct').notNull().default(false),
  sortOrder: integer('sort_order').notNull(),
  assetId: text('asset_id'),
}, (table) => ({
  questionSortIdx: index('idx_question_options_question').on(table.questionId, table.sortOrder),
  correctIdx: index('idx_question_options_correct').on(table.questionId).where(sql`is_correct = true`),
}));

// Phase 5B: Assets table (media management)
export const assets = pgTable('assets', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  type: assetTypeEnum('type').notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  storagePath: text('storage_path').notNull(),
  storageProvider: text('storage_provider').notNull().default('local'),
  uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  schoolTypeIdx: index('idx_assets_school_type').on(table.schoolId, table.type),
  uploaderIdx: index('idx_assets_uploader').on(table.uploadedBy),
}));

// Phase 5B: Question Assets join table
export const questionAssets = pgTable('question_assets', {
  questionId: text('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  assetRole: text('asset_role').notNull().default('illustration'), // 'illustration', 'audio', 'video', 'reference'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.questionId, table.assetId] }),
  questionIdx: index('idx_question_assets_question').on(table.questionId),
  assetIdx: index('idx_question_assets_asset').on(table.assetId),
}));

// Phase 5B: Import Jobs table (import/export tracking)
export const importJobs = pgTable('import_jobs', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  kind: importJobKindEnum('kind').notNull(),
  status: importJobStatusEnum('status').notNull().default('pending'),
  fileAssetId: text('file_asset_id').references(() => assets.id, { onDelete: 'set null' }),
  uploadedBy: text('uploaded_by').notNull().references(() => users.id, { onDelete: 'set null' }),
  totalRows: integer('total_rows').default(0),
  processedRows: integer('processed_rows').default(0),
  succeededRows: integer('succeeded_rows').default(0),
  failedRows: integer('failed_rows').default(0),
  errorSummary: jsonb('error_summary'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  schoolStatusIdx: index('idx_import_jobs_school_status').on(table.schoolId, table.status),
  uploaderIdx: index('idx_import_jobs_uploader').on(table.uploadedBy),
  createdAtIdx: index('idx_import_jobs_created').on(table.createdAt),
}));

// Phase 6: Exam Engine Tables

// Classes table (needed for exam_classes)
export const classes = pgTable('classes', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  levelName: text('level_name'),
  section: text('section').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  schoolSectionIdx: index('idx_classes_school_section').on(table.schoolId, table.section),
}));

// Exams table
export const exams = pgTable('exams', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  subjectId: text('subject_id').notNull().references(() => subjects.id, { onDelete: 'restrict' }),
  kind: examKindEnum('kind').notNull().default('exam'),
  durationMin: integer('duration_min').notNull(),
  shuffleQuestions: boolean('shuffle_questions').notNull().default(true),
  shuffleOptions: boolean('shuffle_options').notNull().default(true),
  negativeMarking: boolean('negative_marking').notNull().default(false),
  showScoreToStudent: boolean('show_score_to_student').notNull().default(false),
  passMarkPct: numeric('pass_mark_pct', { precision: 5, scale: 2 }),
  instructions: text('instructions'),
  status: examStatusEnum('status').notNull().default('draft'),
  frozenAt: timestamp('frozen_at', { withTimezone: true }),
  createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  schoolStatusIdx: index('idx_exams_school_status').on(table.schoolId, table.status, table.createdAt),
  subjectIdx: index('idx_exams_subject').on(table.subjectId),
  creatorIdx: index('idx_exams_creator').on(table.createdBy),
  frozenIdx: index('idx_exams_frozen').on(table.frozenAt),
}));

// Exam Classes join table
export const examClasses = pgTable('exam_classes', {
  examId: text('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.examId, table.classId] }),
  classIdx: index('idx_exam_classes_class').on(table.classId),
}));

// Exam Questions join table
export const examQuestions = pgTable('exam_questions', {
  examId: text('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  questionId: text('question_id').notNull().references(() => questions.id, { onDelete: 'restrict' }),
  position: integer('position').notNull(),
  marksOverride: numeric('marks_override', { precision: 5, scale: 2 }),
}, (table) => ({
  pk: primaryKey({ columns: [table.examId, table.questionId] }),
  questionIdx: index('idx_exam_questions_question').on(table.questionId),
  positionIdx: index('idx_exam_questions_position').on(table.examId, table.position),
}));

// Sittings table
export const sittings = pgTable('sittings', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  examId: text('exam_id').notNull().references(() => exams.id, { onDelete: 'restrict' }),
  classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'restrict' }),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
  extraTimeMin: integer('extra_time_min').notNull().default(0),
  status: sittingStatusEnum('status').notNull().default('scheduled'),
  examKeyHash: text('exam_key_hash'),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: text('closed_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  schoolStatusIdx: index('idx_sittings_school_status').on(table.schoolId, table.status, table.windowStart),
  examIdx: index('idx_sittings_exam').on(table.examId),
  classIdx: index('idx_sittings_class').on(table.classId),
  windowIdx: index('idx_sittings_window').on(table.windowStart, table.windowEnd),
}));

// Exam Packs table
export const examPacks = pgTable('exam_packs', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  examId: text('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  keyVersion: integer('key_version').notNull().default(1),
  manifest: jsonb('manifest').notNull(),
  storageKey: text('storage_key').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  signature: text('signature').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  examVersionUnique: unique('idx_exam_packs_exam_version').on(table.examId, table.version),
  examIdx: index('idx_exam_packs_exam').on(table.examId, table.version),
  sha256Idx: index('idx_exam_packs_sha256').on(table.sha256),
}));

// Phase 9: Results & Analytics Tables

// Grade scales table (BR-18). `bands` is an array of
// `{ min, max, grade, remark? }` covering 0..100 with no gaps or overlaps.
export const gradeScales = pgTable('grade_scales', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  bands: jsonb('bands').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  schoolIdx: index('idx_grade_scales_school').on(table.schoolId),
  defaultIdx: index('idx_grade_scales_default').on(table.schoolId, table.isDefault),
}));

// Submissions table (uploaded from the school server; id = session_id).
export const submissions = pgTable('submissions', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  sittingId: text('sitting_id').notNull().references(() => sittings.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  examId: text('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  classId: text('class_id').references(() => classes.id, { onDelete: 'set null' }),
  packVersion: integer('pack_version').notNull(),
  keyVersion: integer('key_version').notNull().default(1),
  seat: text('seat'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  submitReason: text('submit_reason'),
  status: submissionStatusEnum('status').notNull().default('active'),
  schoolScore: numeric('school_score', { precision: 7, scale: 2 }),
  cloudScore: numeric('cloud_score', { precision: 7, scale: 2 }),
  focusLostCount: integer('focus_lost_count').notNull().default(0),
  extraSeconds: integer('extra_seconds').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  sittingStudentUnique: unique('idx_submissions_sitting_student').on(table.sittingId, table.studentId),
  schoolExamIdx: index('idx_submissions_school_exam').on(table.schoolId, table.examId),
  studentIdx: index('idx_submissions_student').on(table.studentId),
  examIdx: index('idx_submissions_exam').on(table.examId),
}));

// Final answers for a submission. `question_id` is intentionally not a foreign
// key: an answer may reference a question version that has since been superseded.
export const submissionAnswers = pgTable('submission_answers', {
  submissionId: text('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  questionId: text('question_id').notNull(),
  answer: jsonb('answer'),
  flagged: boolean('flagged').notNull().default(false),
  seq: integer('seq').notNull().default(0),
  answeredAt: timestamp('answered_at', { withTimezone: true }),
  cloudMarks: numeric('cloud_marks', { precision: 5, scale: 2 }),
  maxMarks: numeric('max_marks', { precision: 5, scale: 2 }),
}, (table) => ({
  pk: primaryKey({ columns: [table.submissionId, table.questionId] }),
  questionIdx: index('idx_submission_answers_question').on(table.questionId),
}));

// Results table (BR-14 status machine: draft -> reviewed -> released | withdrawn).
export const results = pgTable('results', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  submissionId: text('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  examId: text('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  subjectId: text('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
  classId: text('class_id').references(() => classes.id, { onDelete: 'set null' }),
  score: numeric('score', { precision: 7, scale: 2 }).notNull(),
  maxScore: numeric('max_score', { precision: 7, scale: 2 }).notNull(),
  percent: numeric('percent', { precision: 5, scale: 2 }).notNull(),
  grade: text('grade'),
  keyVersion: integer('key_version').notNull().default(1),
  status: resultStatusEnum('status').notNull().default('draft'),
  revision: integer('revision').notNull().default(1),
  reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  releasedBy: text('released_by').references(() => users.id, { onDelete: 'set null' }),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  withdrawnReason: text('withdrawn_reason'),
  teacherComment: text('teacher_comment'),
  updated: boolean('updated').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  submissionUnique: unique('idx_results_submission').on(table.submissionId),
  parentViewIdx: index('idx_results_parent_view').on(table.studentId, table.status),
  examClassIdx: index('idx_results_exam_class').on(table.examId, table.classId),
  schoolStatusIdx: index('idx_results_school_status').on(table.schoolId, table.status),
}));

// Key-correction runs. A run previews the effect of a corrected answer key and
// applies it only on confirmation (API spec 9.3), never editing the question.
export const remarkRuns = pgTable('remark_runs', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  examId: text('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  questionId: text('question_id').notNull(),
  newQuestionId: text('new_question_id'),
  reason: text('reason').notNull(),
  requestedBy: text('requested_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: remarkRunStatusEnum('status').notNull().default('previewed'),
  affected: integer('affected').notNull().default(0),
  newKeyVersion: integer('new_key_version'),
  correction: jsonb('correction'),
  preview: jsonb('preview'),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  examStatusIdx: index('idx_remark_runs_exam_status').on(table.examId, table.status),
}));

// Notifications table (API spec 11.2). No template ever contains a score.
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  guardianId: text('guardian_id').references(() => guardians.id, { onDelete: 'set null' }),
  studentId: text('student_id').references(() => students.id, { onDelete: 'set null' }),
  resultId: text('result_id').references(() => results.id, { onDelete: 'set null' }),
  channel: notificationChannelEnum('channel').notNull(),
  template: text('template').notNull(),
  payload: jsonb('payload'),
  status: notificationStatusEnum('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  schoolStatusIdx: index('idx_notifications_school_status').on(table.schoolId, table.status, table.createdAt),
  guardianReadIdx: index('idx_notifications_guardian_read').on(table.guardianId, table.readAt),
  userReadIdx: index('idx_notifications_user_read').on(table.userId, table.readAt),
}));

// Audit log (API spec 11.4, US-16.1). Append-only: an entry is written once and
// there is deliberately no update or delete path. The `entity_*` columns carry
// the affected resource; `detail` holds action-specific context.
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  schoolId: text('school_id').references(() => schools.id, { onDelete: 'set null' }),
  actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  actorRole: text('actor_role'),
  action: text('action').notNull(),
  outcome: auditOutcomeEnum('outcome').notNull().default('success'),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  requestId: text('request_id'),
  detail: jsonb('detail'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  schoolAtIdx: index('idx_audit_logs_school_at').on(table.schoolId, table.at),
  actionIdx: index('idx_audit_logs_action').on(table.action),
  actorIdx: index('idx_audit_logs_actor').on(table.actorUserId),
  entityIdx: index('idx_audit_logs_entity').on(table.entityType, table.entityId),
}));

// Types
export type School = typeof schools.$inferSelect;
export type NewSchool = typeof schools.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type OtpChallenge = typeof otpChallenges.$inferSelect;
export type NewOtpChallenge = typeof otpChallenges.$inferInsert;

export type TeacherProfile = typeof teacherProfiles.$inferSelect;
export type NewTeacherProfile = typeof teacherProfiles.$inferInsert;

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;

export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;

export type StudentCodeRecord = typeof studentCodes.$inferSelect;
export type NewStudentCodeRecord = typeof studentCodes.$inferInsert;

export type Guardian = typeof guardians.$inferSelect;
export type NewGuardian = typeof guardians.$inferInsert;

export type Guardianship = typeof guardianships.$inferSelect;
export type NewGuardianship = typeof guardianships.$inferInsert;

// Phase 5: Question Bank Types
export type SubjectRecord = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;

export type Level = typeof levels.$inferSelect;
export type NewLevel = typeof levels.$inferInsert;

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;

export type QuestionOption = typeof questionOptions.$inferSelect;
export type NewQuestionOption = typeof questionOptions.$inferInsert;

// Phase 5B: Additional Types
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

export type QuestionAsset = typeof questionAssets.$inferSelect;
export type NewQuestionAsset = typeof questionAssets.$inferInsert;

export type ImportJob = typeof importJobs.$inferSelect;
export type NewImportJob = typeof importJobs.$inferInsert;

// Phase 6: Exam Engine Types
export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;

export type Exam = typeof exams.$inferSelect;
export type NewExam = typeof exams.$inferInsert;

export type ExamClass = typeof examClasses.$inferSelect;
export type NewExamClass = typeof examClasses.$inferInsert;

export type ExamQuestion = typeof examQuestions.$inferSelect;
export type NewExamQuestion = typeof examQuestions.$inferInsert;

export type Sitting = typeof sittings.$inferSelect;
export type NewSitting = typeof sittings.$inferInsert;

export type ExamPack = typeof examPacks.$inferSelect;
export type NewExamPack = typeof examPacks.$inferInsert;

// Phase 9: Results & Analytics Types
export type GradeScale = typeof gradeScales.$inferSelect;
export type NewGradeScale = typeof gradeScales.$inferInsert;

export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;

export type SubmissionAnswer = typeof submissionAnswers.$inferSelect;
export type NewSubmissionAnswer = typeof submissionAnswers.$inferInsert;

export type Result = typeof results.$inferSelect;
export type NewResult = typeof results.$inferInsert;

export type RemarkRun = typeof remarkRuns.$inferSelect;
export type NewRemarkRun = typeof remarkRuns.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
