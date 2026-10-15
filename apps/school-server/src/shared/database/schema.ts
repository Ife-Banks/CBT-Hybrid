import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';

// SQLite schema for school server (subset of cloud schema)
// SQLite doesn't have native enums, so we use text with CHECK constraints

export const schools = sqliteTable('schools', {
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
}, (table) => ({
  statusIdx: index('idx_schools_status').on(table.status),
  expiryIdx: index('idx_schools_expiry').on(table.licenceExpires),
}));

export const users = sqliteTable('users', {
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
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(false),
  preferences: text('preferences').default('{}'), // JSON string
  passwordChangedAt: integer('password_changed_at'), // Unix timestamp
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  schoolEmailIdx: unique('idx_users_school_email').on(table.schoolId, table.email),
  schoolPhoneIdx: unique('idx_users_school_phone').on(table.schoolId, table.phoneE164),
  schoolRoleIdx: index('idx_users_school_role').on(table.schoolId, table.role),
  lockedIdx: index('idx_users_locked').on(table.lockedUntil),
}));

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(), // Unix timestamp
  lastSeenAt: integer('last_seen_at'), // Unix timestamp
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  deviceName: text('device_name'),
  revokedAt: integer('revoked_at'), // Unix timestamp
  sliding: integer('sliding', { mode: 'boolean' }).default(false),
}, (table) => ({
  userIdx: index('idx_sessions_user').on(table.userId, table.createdAt),
  expiresIdx: index('idx_sessions_expires').on(table.expiresAt),
  tokenIdx: index('idx_sessions_token').on(table.tokenHash),
}));

export const otpChallenges = sqliteTable('otp_challenges', {
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
}, (table) => ({
  lookupIdx: index('idx_otp_challenges_lookup').on(table.id, table.codeHash),
  cleanupIdx: index('idx_otp_cleanup').on(table.expiresAt),
}));
