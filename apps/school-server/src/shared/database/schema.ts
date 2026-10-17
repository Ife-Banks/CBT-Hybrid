import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

// SQLite schema for the school server (CBT-Database-Architecture section 4.2).
// SQLite has no native enums, so text columns carry CHECK constraints naming
// their allowed values. Exam-delivery tables use ISO-8601 TEXT timestamps, as
// the specification does.

// ── Local accounts (placeholders for school-side sign-in) ──────────────────

export const schools = sqliteTable(
  'schools',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    address: text('address'),
    logoAssetId: text('logo_asset_id'),
    timezone: text('timezone').notNull().default('Africa/Lagos'),
    gradeScaleId: text('grade_scale_id'),
    status: text('status').notNull().default('active'),
    licenceExpires: integer('licence_expires'), // Unix timestamp
    maxStudents: integer('max_students').notNull().default(1000),
    settings: text('settings').default('{}'), // JSON string
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_schools_status').on(table.status),
    index('idx_schools_expiry').on(table.licenceExpires),
  ],
);

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    schoolId: text('school_id').references(() => schools.id, { onDelete: 'restrict' }),
    role: text('role').notNull(), // platform_owner, school_admin, teacher, invigilator, parent, student
    fullName: text('full_name').notNull(),
    email: text('email'),
    phoneE164: text('phone_e164'),
    passwordHash: text('password_hash').notNull(),
    status: text('status').notNull().default('invited'), // invited, active, suspended, deactivated
    totpSecret: text('totp_secret'),
    recoveryCodeHashes: text('recovery_code_hashes'), // JSON string array
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: integer('locked_until'), // Unix timestamp
    lastLoginAt: integer('last_login_at'), // Unix timestamp
    mustChangePassword: integer('must_change_password', { mode: 'boolean' })
      .notNull()
      .default(false),
    preferences: text('preferences').default('{}'), // JSON string
    passwordChangedAt: integer('password_changed_at'), // Unix timestamp
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    unique('idx_users_school_email').on(table.schoolId, table.email),
    unique('idx_users_school_phone').on(table.schoolId, table.phoneE164),
    index('idx_users_school_role').on(table.schoolId, table.role),
    index('idx_users_locked').on(table.lockedUntil),
  ],
);

/**
 * Staff/parent sign-in sessions. Renamed from `sessions` so the exam-session
 * table can use the name CBT-Database-Architecture section 4.2 gives it.
 */
export const authSessions = sqliteTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(), // Unix timestamp
    lastSeenAt: integer('last_seen_at'), // Unix timestamp
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    deviceName: text('device_name'),
    revokedAt: integer('revoked_at'), // Unix timestamp
    sliding: integer('sliding', { mode: 'boolean' }).default(false),
  },
  (table) => [
    index('idx_auth_sessions_user').on(table.userId, table.createdAt),
    index('idx_auth_sessions_expires').on(table.expiresAt),
    index('idx_auth_sessions_token').on(table.tokenHash),
  ],
);

export const otpChallenges = sqliteTable(
  'otp_challenges',
  {
    id: text('id').primaryKey(),
    invitationId: text('invitation_id'),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(), // password_reset
    sentTo: text('sent_to').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    expiresAt: integer('expires_at').notNull(), // Unix timestamp
    consumedAt: integer('consumed_at'), // Unix timestamp
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_otp_challenges_lookup').on(table.id, table.codeHash),
    index('idx_otp_cleanup').on(table.expiresAt),
  ],
);

// ── Exam delivery (CBT-Database-Architecture section 4.2) ──────────────────

/** Device identity and school metadata, keyed by name. */
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const classes = sqliteTable(
  'classes',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    levelName: text('level_name'),
    section: text('section').notNull(), // nursery, primary, secondary
  },
  (table) => [
    check('classes_section_check', sql`${table.section} IN ('nursery','primary','secondary')`),
    index('idx_classes_section').on(table.section),
  ],
);

export const subjects = sqliteTable('subjects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code'),
});

export const students = sqliteTable(
  'students',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    codeStatus: text('code_status').notNull(), // active, revoked
    fullName: text('full_name').notNull(),
    classId: text('class_id').references(() => classes.id),
    section: text('section').notNull(),
    photoPath: text('photo_path'),
    syncedAt: text('synced_at').notNull(),
  },
  (table) => [
    check('students_code_status_check', sql`${table.codeStatus} IN ('active','revoked')`),
    index('idx_students_code').on(table.code),
    index('idx_students_class').on(table.classId),
    index('idx_students_name').on(table.fullName),
  ],
);

export const exams = sqliteTable('exams', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  subjectId: text('subject_id').references(() => subjects.id),
  durationMin: integer('duration_min').notNull(),
  settingsJson: text('settings_json').notNull(), // shuffle, marks, pass_mark, ...
  syncedAt: text('synced_at').notNull(),
});

export const packs = sqliteTable(
  'packs',
  {
    id: text('id').primaryKey(),
    examId: text('exam_id')
      .notNull()
      .references(() => exams.id),
    version: integer('version').notNull(),
    keyVersion: integer('key_version').notNull(),
    dirPath: text('dir_path').notNull(),
    sha256: text('sha256').notNull(),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    questionCount: integer('question_count'),
    totalMarks: real('total_marks'),
    downloadedAt: text('downloaded_at').notNull(),
  },
  (table) => [
    unique('idx_packs_exam_version').on(table.examId, table.version),
    index('idx_packs_exam').on(table.examId, table.version),
    index('idx_packs_unverified').on(table.verified).where(sql`${table.verified} = 0`),
  ],
);

export const sittings = sqliteTable(
  'sittings',
  {
    id: text('id').primaryKey(),
    examId: text('exam_id')
      .notNull()
      .references(() => exams.id),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id),
    packId: text('pack_id')
      .notNull()
      .references(() => packs.id),
    windowStart: text('window_start').notNull(),
    windowEnd: text('window_end').notNull(),
    extraTimeMin: integer('extra_time_min').notNull().default(0),
    examKeyHash: text('exam_key_hash'),
    status: text('status').notNull().default('scheduled'), // scheduled, open, closed
    openedAt: text('opened_at'),
    closedAt: text('closed_at'),
    syncedAt: text('synced_at').notNull(),
  },
  (table) => [
    check('sittings_status_check', sql`${table.status} IN ('scheduled','open','closed')`),
    index('idx_sittings_status').on(table.status, table.windowStart),
    index('idx_sittings_exam').on(table.examId),
    index('idx_sittings_class').on(table.classId),
  ],
);

export const seats = sqliteTable('seats', {
  code: text('code').primaryKey(),
  label: text('label'),
  lastSeenAt: text('last_seen_at'),
  lastIp: text('last_ip'),
});

/**
 * Exam sessions. The SQLite table is named `sessions` as the specification
 * says; the export is `examSessions` to keep it apart from {@link authSessions}.
 */
export const examSessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    sittingId: text('sitting_id')
      .notNull()
      .references(() => sittings.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    seat: text('seat'),
    tokenHash: text('token_hash').notNull(),
    seed: integer('seed').notNull(),
    startedAt: text('started_at').notNull(),
    endsAt: text('ends_at').notNull(),
    status: text('status').notNull().default('in_progress'), // in_progress, submitted, expired, reset
    submittedAt: text('submitted_at'),
    submitReason: text('submit_reason'), // student, time_up, invigilator, window_closed
    lastSeq: integer('last_seq').notNull().default(0),
    focusLostCount: integer('focus_lost_count').notNull().default(0),
    lastSeenAt: text('last_seen_at'),
    lastIp: text('last_ip'),
  },
  (table) => [
    check(
      'sessions_status_check',
      sql`${table.status} IN ('in_progress','submitted','expired','reset')`,
    ),
    unique('idx_sessions_sitting_student').on(table.sittingId, table.studentId),
    index('idx_sessions_sitting').on(table.sittingId, table.status),
    index('idx_sessions_student').on(table.studentId),
    index('idx_sessions_token').on(table.tokenHash).where(sql`${table.status} = 'in_progress'`),
    index('idx_sessions_seat').on(table.seat).where(sql`${table.seat} IS NOT NULL`),
  ],
);

export const answers = sqliteTable(
  'answers',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => examSessions.id, { onDelete: 'cascade' }),
    questionId: text('question_id').notNull(),
    answerJson: text('answer_json').notNull(),
    seq: integer('seq').notNull(),
    savedAt: text('saved_at').notNull(),
  },
  (table) => [
    // One answer row per question per session.
    primaryKey({ columns: [table.sessionId, table.questionId] }),
    index('idx_answers_session').on(table.sessionId),
  ],
);

export const results = sqliteTable('results', {
  sessionId: text('session_id')
    .primaryKey()
    .references(() => examSessions.id, { onDelete: 'cascade' }),
  score: real('score').notNull(),
  maxScore: real('max_score').notNull(),
  percent: real('percent').notNull(),
  grade: text('grade'),
  scoredAt: text('scored_at').notNull(),
});

export const sessionEvents = sqliteTable(
  'session_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id')
      .notNull()
      .references(() => examSessions.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // focus_lost, focus_regained
    at: text('at').notNull(),
  },
  (table) => [
    index('idx_session_events_session').on(table.sessionId),
    index('idx_session_events_at').on(table.at),
  ],
);

export const outbox = sqliteTable(
  'outbox',
  {
    eventId: text('event_id').primaryKey(),
    type: text('type').notNull(),
    payloadJson: text('payload_json').notNull(),
    createdAt: text('created_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: text('next_attempt_at'),
    ackedAt: text('acked_at'),
    errorMsg: text('error_msg'),
  },
  (table) => [
    index('idx_outbox_pending')
      .on(table.nextAttemptAt, table.attempts)
      .where(sql`${table.ackedAt} IS NULL`),
    index('idx_outbox_type').on(table.type, table.createdAt),
  ],
);

export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    at: text('at').notNull(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    detailJson: text('detail_json'),
  },
  (table) => [
    index('idx_audit_log_at').on(table.at),
    index('idx_audit_log_action').on(table.action),
  ],
);

export const backupLog = sqliteTable(
  'backup_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    at: text('at').notNull(),
    path: text('path').notNull(),
    bytes: integer('bytes'),
    sha256: text('sha256'),
    ok: integer('ok', { mode: 'boolean' }).notNull(),
  },
  (table) => [index('idx_backup_log_at').on(table.at)],
);

// ── Phase 8: Sync system (CBT-Phase-8-SyncSystem) ──────────────────────────
//
// These tables support bidirectional synchronisation between the cloud API and
// school servers: conflict detection/resolution, per-sync metrics, resumable
// checkpoints, retry history and per-entity version vectors for incremental and
// cross-school-isolated sync.

/**
 * One row per detected conflict: the same entity was modified on both the cloud
 * and the school server since their last common sync. The losing value is kept
 * for audit; `resolved_json` holds the value actually applied once resolved.
 */
export const syncConflicts = sqliteTable(
  'sync_conflicts',
  {
    id: text('id').primaryKey(),
    schoolId: text('school_id').notNull().default('local'),
    entityType: text('entity_type').notNull(), // student, roster, pack, event, result
    entityId: text('entity_id').notNull(),
    localVersion: integer('local_version').notNull().default(0),
    remoteVersion: integer('remote_version').notNull().default(0),
    localUpdatedAt: text('local_updated_at'),
    remoteUpdatedAt: text('remote_updated_at'),
    localJson: text('local_json').notNull(),
    remoteJson: text('remote_json').notNull(),
    status: text('status').notNull().default('open'), // open, resolved, ignored
    resolution: text('resolution'), // local_wins, remote_wins, merged, manual
    resolvedJson: text('resolved_json'),
    detectedAt: text('detected_at').notNull(),
    resolvedAt: text('resolved_at'),
    resolvedBy: text('resolved_by'),
  },
  (table) => [
    check(
      'sync_conflicts_status_check',
      sql`${table.status} IN ('open','resolved','ignored')`,
    ),
    index('idx_sync_conflicts_status').on(table.status, table.detectedAt),
    index('idx_sync_conflicts_entity').on(table.entityType, table.entityId),
    index('idx_sync_conflicts_school').on(table.schoolId, table.status),
  ],
);

/** Aggregated statistics for a single sync cycle. */
export const syncMetrics = sqliteTable(
  'sync_metrics',
  {
    syncId: text('sync_id').primaryKey(),
    schoolId: text('school_id').notNull().default('local'),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    durationMs: integer('duration_ms'),
    pushed: integer('pushed').notNull().default(0),
    pulledRoster: integer('pulled_roster').notNull().default(0),
    pulledPacks: integer('pulled_packs').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    conflictsDetected: integer('conflicts_detected').notNull().default(0),
    conflictsResolved: integer('conflicts_resolved').notNull().default(0),
    bytesTransferred: integer('bytes_transferred').notNull().default(0),
    status: text('status').notNull().default('running'), // running, success, partial, failed
  },
  (table) => [
    check(
      'sync_metrics_status_check',
      sql`${table.status} IN ('running','success','partial','failed')`,
    ),
    index('idx_sync_metrics_started').on(table.startedAt),
    index('idx_sync_metrics_school').on(table.schoolId, table.startedAt),
  ],
);

/**
 * Resumable progress checkpoints. A long sync records where it got to in each
 * phase so an interrupted run can resume rather than restart from scratch.
 */
export const syncCheckpoints = sqliteTable(
  'sync_checkpoints',
  {
    id: text('id').primaryKey(),
    syncId: text('sync_id').notNull(),
    schoolId: text('school_id').notNull().default('local'),
    phase: text('phase').notNull(), // push, pull_roster, pull_packs
    cursor: text('cursor'),
    processed: integer('processed').notNull().default(0),
    total: integer('total').notNull().default(0),
    status: text('status').notNull().default('pending'), // pending, in_progress, completed, failed
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check(
      'sync_checkpoints_status_check',
      sql`${table.status} IN ('pending','in_progress','completed','failed')`,
    ),
    unique('idx_sync_checkpoints_sync_phase').on(table.syncId, table.phase),
    index('idx_sync_checkpoints_school').on(table.schoolId, table.updatedAt),
  ],
);

/** Audit trail of every retry attempt for an outbox event. */
export const syncRetryHistory = sqliteTable(
  'sync_retry_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eventId: text('event_id').notNull(),
    schoolId: text('school_id').notNull().default('local'),
    attempt: integer('attempt').notNull(),
    errorMsg: text('error_msg').notNull(),
    attemptedAt: text('attempted_at').notNull(),
    nextAttemptAt: text('next_attempt_at'),
  },
  (table) => [
    index('idx_sync_retry_event').on(table.eventId, table.attempt),
    index('idx_sync_retry_school').on(table.schoolId, table.attemptedAt),
  ],
);

/**
 * Per-entity version vectors powering incremental, field-aware sync. The
 * `local_*` values describe this school server; the `remote_*` values describe
 * the last state seen from the cloud.
 */
export const syncEntityVersions = sqliteTable(
  'sync_entity_versions',
  {
    schoolId: text('school_id').notNull().default('local'),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    localVersion: integer('local_version').notNull().default(0),
    remoteVersion: integer('remote_version').notNull().default(0),
    baseVersion: integer('base_version').notNull().default(0),
    /** JSON snapshot both sides last agreed on, for three-way merges. */
    baseJson: text('base_json'),
    localUpdatedAt: text('local_updated_at'),
    remoteUpdatedAt: text('remote_updated_at'),
    lastSyncedAt: text('last_synced_at'),
  },
  (table) => [
    // Scoped by school so two schools sharing a database can never collide.
    primaryKey({ columns: [table.schoolId, table.entityType, table.entityId] }),
    index('idx_sync_entity_versions_entity').on(table.entityType, table.entityId),
  ],
);
