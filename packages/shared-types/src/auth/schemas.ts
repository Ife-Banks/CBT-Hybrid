/**
 * Request and response schemas for the cloud sign-in and session endpoints
 * (API and Sync Specification section 3). Field names are `snake_case` per
 * section 1.2, and these schemas are the ones validated on the server and
 * reused as TypeScript types by the frontends.
 */

import { z } from 'zod';
import { ROLES } from '../permissions';

/** An email address or a phone number (E.164 or local style). */
export const IdentifierSchema = z.string().trim().min(1).max(254);

export const LoginRequestSchema = z.object({
  identifier: IdentifierSchema,
  password: z.string().min(1).max(1024),
  /**
   * A 6-digit authenticator code, or a `XXXXX-XXXXX` recovery code. Needed only
   * when two-step verification is enabled on the account.
   */
  totp: z
    .string()
    .trim()
    .regex(
      /^[0-9]{6}$|^[0-9A-Za-z]{5}-?[0-9A-Za-z]{5}$/,
      'Expected a 6-digit code or a recovery code',
    )
    .optional(),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** Minimal school reference embedded in the signed-in user. */
export const SchoolRefSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
});

export type SchoolRef = z.infer<typeof SchoolRefSchema>;

/** The signed-in user, as embedded in login and `GET /auth/me` responses. */
export const SessionUserSchema = z.object({
  id: z.string(),
  role: z.enum(ROLES),
  full_name: z.string(),
  /** Absent for the platform owner, who is not tied to a school. */
  school: SchoolRefSchema.optional(),
  must_change_password: z.boolean(),
});

export type SessionUser = z.infer<typeof SessionUserSchema>;

/** Login success: also sets the `cbt_session` and `cbt_csrf` cookies. */
export const LoginResponseSchema = z.object({
  user: SessionUserSchema,
  csrf_token: z.string(),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/** Licence state for a school (read-only mode after expiry, US-1.3). */
export const LicenceStateSchema = z.object({
  state: z.enum(['active', 'read_only', 'none']),
  expires_at: z.iso.datetime().optional(),
});

export type LicenceState = z.infer<typeof LicenceStateSchema>;

/** `GET /auth/me` response. */
export const MeResponseSchema = z.object({
  user: SessionUserSchema,
  licence: LicenceStateSchema,
  csrf_token: z.string(),
});

export type MeResponse = z.infer<typeof MeResponseSchema>;

/** One row of `GET /auth/sessions`. */
export const SessionSummarySchema = z.object({
  id: z.string(),
  /** Best-effort device label from the user agent. */
  device: z.string(),
  ip: z.string(),
  created_at: z.iso.datetime(),
  last_seen_at: z.iso.datetime(),
  /** True for the session making the request. */
  current: z.boolean(),
});

export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const SessionsResponseSchema = z.object({
  sessions: z.array(SessionSummarySchema),
});

export type SessionsResponse = z.infer<typeof SessionsResponseSchema>;

/** New-password rules are enforced by the server (API spec section 3). */
export const NewPasswordSchema = z.string().min(10).max(1024);

export const PasswordChangeRequestSchema = z.object({
  current_password: z.string().min(1).max(1024),
  new_password: NewPasswordSchema,
});

export type PasswordChangeRequest = z.infer<typeof PasswordChangeRequestSchema>;

export const PasswordForgotRequestSchema = z.object({
  identifier: IdentifierSchema,
});

export type PasswordForgotRequest = z.infer<typeof PasswordForgotRequestSchema>;

/** Always `202 { challenge_id }`, whether or not the account exists. */
export const PasswordForgotResponseSchema = z.object({
  challenge_id: z.string(),
});

export type PasswordForgotResponse = z.infer<typeof PasswordForgotResponseSchema>;

export const PasswordResetRequestSchema = z.object({
  challenge_id: z.string().min(1),
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'Expected a 6-digit code'),
  new_password: NewPasswordSchema,
});

export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

/** `POST /auth/2fa/setup` response, for the QR code. */
export const TotpSetupResponseSchema = z.object({
  otpauth_uri: z.string(),
  secret: z.string(),
});

export type TotpSetupResponse = z.infer<typeof TotpSetupResponseSchema>;

export const TotpEnableRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'Expected a 6-digit code'),
});

export type TotpEnableRequest = z.infer<typeof TotpEnableRequestSchema>;

/** `POST /auth/2fa/enable` response; the codes are shown once. */
export const TotpEnableResponseSchema = z.object({
  recovery_codes: z.array(z.string()).length(10),
});

export type TotpEnableResponse = z.infer<typeof TotpEnableResponseSchema>;

export const TotpDisableRequestSchema = z.object({
  password: z.string().min(1).max(1024),
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'Expected a 6-digit code'),
});

export type TotpDisableRequest = z.infer<typeof TotpDisableRequestSchema>;
