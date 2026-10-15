import { pgTable, text, timestamp, integer, boolean, pgEnum, index, unique, jsonb, primaryKey, numeric } from 'drizzle-orm/pg-core';
import { sql, eq } from 'drizzle-orm';

// Enums - aligned with Phase 2 domain types
export const userRoleEnum = pgEnum('user_role', ['platform_owner', 'school_admin', 'teacher', 'invigilator', 'parent', 'student']);
export const userStatusEnum = pgEnum('user_status', ['invited', 'active', 'suspended', 'deactivated']);
export const otpPurposeEnum = pgEnum('otp_purpose', ['password_reset']);
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
