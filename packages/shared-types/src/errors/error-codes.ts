/**
 * Error catalogue (API and Sync Specification section 2). This is the
 * authoritative list; `code` is the stable, machine-readable value returned in
 * every `application/problem+json` response.
 */
export interface ErrorDefinition {
  /** HTTP status code. */
  status: number;
  /** Short human-readable title. */
  title: string;
}

export const ERROR_CATALOGUE = {
  // System and request errors
  BAD_REQUEST: { status: 400, title: 'Bad request' },
  INTERNAL: { status: 500, title: 'Internal server error' },

  // Authentication and authorisation
  AUTH_REQUIRED: { status: 401, title: 'Authentication required' },
  INVALID_CREDENTIALS: { status: 401, title: 'Invalid credentials' },
  TOTP_REQUIRED: { status: 401, title: 'Authenticator code required' },
  TOTP_INVALID: { status: 401, title: 'Invalid authenticator code' },
  CLOCK_SKEW: { status: 401, title: 'Clock skew too large' },
  SIGNATURE_INVALID: { status: 401, title: 'Invalid signature' },
  FORBIDDEN: { status: 403, title: 'Forbidden' },
  LICENCE_EXPIRED: { status: 403, title: 'Licence expired' },
  DEVICE_REVOKED: { status: 403, title: 'Device revoked' },

  // Resources and state
  NOT_FOUND: { status: 404, title: 'Not found' },
  CONFLICT: { status: 409, title: 'Conflict' },
  GUARDIAN_MATCH_FOUND: { status: 409, title: 'Guardian already exists' },
  EXAM_FROZEN: { status: 409, title: 'Exam is frozen' },
  INVITE_EXPIRED: { status: 410, title: 'Invitation expired' },
  INVITE_USED: { status: 410, title: 'Invitation already used' },
  INVITE_REVOKED: { status: 410, title: 'Invitation revoked' },

  // One-time codes and lockouts
  OTP_INVALID: { status: 400, title: 'Invalid one-time code' },
  OTP_LOCKED: { status: 429, title: 'Too many wrong codes' },
  ACCOUNT_LOCKED: { status: 423, title: 'Account locked' },

  // Validation and imports
  VALIDATION_FAILED: { status: 422, title: 'Validation failed' },
  EXAM_NOT_PUBLISHABLE: { status: 422, title: 'Exam is not publishable' },
  IMPORT_FILE_REJECTED: { status: 422, title: 'Import file rejected' },

  // Rate limiting and protocol
  RATE_LIMITED: { status: 429, title: 'Rate limited' },
  SYNC_PROTOCOL_UNSUPPORTED: { status: 426, title: 'Sync protocol unsupported' },

  // Student exam client (school server)
  CODE_FORMAT_INVALID: { status: 422, title: 'Student code format invalid' },
  CODE_NOT_FOUND: { status: 404, title: 'Student code not found' },
  CODE_REVOKED: { status: 403, title: 'Student code revoked' },
  KEY_INVALID: { status: 401, title: 'Exam key invalid' },
  NOT_IN_SITTING: { status: 403, title: 'Not in sitting' },
  SITTING_NOT_OPEN: { status: 409, title: 'Sitting not open' },
  ALREADY_SUBMITTED: { status: 409, title: 'Already submitted' },
  SESSION_ACTIVE_ELSEWHERE: { status: 409, title: 'Session active elsewhere' },
  SEAT_LOCKED: { status: 429, title: 'Seat locked' },
  SESSION_CLOSED: { status: 409, title: 'Session closed' },
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCode = keyof typeof ERROR_CATALOGUE;

/** Every error code, in catalogue order. */
export const ERROR_CODES = Object.keys(ERROR_CATALOGUE) as ErrorCode[];

/** HTTP status for an error code. */
export function errorStatus(code: ErrorCode): number {
  return ERROR_CATALOGUE[code].status;
}

/** Human-readable title for an error code. */
export function errorTitle(code: ErrorCode): string {
  return ERROR_CATALOGUE[code].title;
}

/** Type guard for a string that is a known error code. */
export function isErrorCode(value: string): value is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_CATALOGUE, value);
}
