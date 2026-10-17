import type { Role } from '@cbt/shared-types';

/** A school reference embedded in the signed-in user. */
export interface SchoolRef {
  id: string;
  code: string;
  name: string;
}

/**
 * Stored user record. In Phase 2 this lives in an in-memory repository; the
 * Drizzle-backed table (`users`) arrives with the data layer (CBT-04 M2 / Phase
 * 3). Field names follow the API spec's `snake_case` where they are returned.
 */
export interface UserRecord {
  id: string;
  role: Role;
  fullName: string;
  /** Lower-cased email, or null. */
  email: string | null;
  /** E.164 phone, or null. */
  phone: string | null;
  /** Null for the platform owner, who is not tied to a school. */
  schoolId: string | null;
  school: SchoolRef | null;
  /** Argon2id encoded hash. */
  passwordHash: string;
  mustChangePassword: boolean;
  status: 'active' | 'suspended';
  totpEnabled: boolean;
  /** Base32 secret while 2FA is configured but not yet confirmed. */
  totpSecret: string | null;
  /** SHA-256 hashes of the unused recovery codes. */
  recoveryCodeHashes: string[];
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  preferences?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Stored session row. The cookie holds the token; we store only its SHA-256. */
export interface SessionRecord {
  id: string;
  userId: string;
  /** SHA-256 hex of the session token. */
  tokenHash: string;
  ip: string;
  userAgent: string;
  deviceName?: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  /** True for parent sessions, which slide on activity (API spec section 20). */
  sliding: boolean;
  revokedAt: Date | null;
}

/** One-time-code challenge: password reset or a parent's email change. */
export interface OtpChallengeRecord {
  id: string;
  userId: string;
  purpose: 'password_reset' | 'guardian_email';
  sentTo: string;
  /** SHA-256 hex of the code. */
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}

/** Request metadata captured with sessions and audit entries. */
export interface RequestContext {
  ip: string;
  userAgent: string;
  requestId: string;
}

/** The authenticated principal attached to a request. */
export interface AuthContext {
  user: UserRecord;
  session: SessionRecord;
}
