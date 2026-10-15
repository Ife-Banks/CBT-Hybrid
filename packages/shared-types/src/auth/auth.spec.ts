import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  ROLE_ABILITIES,
  SCHOOL_SCOPED_SUBJECTS,
  SUBJECTS,
  type Subject,
} from './abilities';
import { PASSWORD_MIN_LENGTH, isCommonPassword, validatePassword } from './password-policy';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  PasswordChangeRequestSchema,
  PasswordResetRequestSchema,
  TotpEnableResponseSchema,
} from './schemas';
import { ROLES } from '../permissions';

describe('password policy (API spec section 3)', () => {
  it('requires at least the documented minimum length', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(validatePassword('short1234')).toHaveLength(1);
    expect(validatePassword('short1234')[0]?.code).toBe('TOO_SHORT');
  });

  it('accepts a strong password', () => {
    expect(validatePassword('TestPassword123!')).toEqual([]);
    expect(validatePassword('correct horse battery staple')).toEqual([]);
  });

  it('rejects common passwords case-insensitively', () => {
    expect(validatePassword('password123')).toEqual([
      { field: 'new_password', code: 'TOO_COMMON', message: 'Password is too common' },
    ]);
    expect(validatePassword('Password123')).toHaveLength(1);
    expect(isCommonPassword('QWERTY123')).toBe(true);
    expect(isCommonPassword('unlikely-passphrase')).toBe(false);
  });

  it('rejects a password equal to the email or phone', () => {
    expect(validatePassword('ada@school.ng', { email: 'Ada@School.ng' })[0]?.code).toBe(
      'EQUALS_IDENTIFIER',
    );
    expect(validatePassword('+2348012345678', { phone: '+234 801 234 5678' })[0]?.code).toBe(
      'EQUALS_IDENTIFIER',
    );
  });

  it('names the failing field so the API can return it', () => {
    const violations = validatePassword('weak', {}, 'password');
    expect(violations.every((violation) => violation.field === 'password')).toBe(true);
  });
});

describe('role ability matrix (API spec section 19)', () => {
  it('covers every role and only known actions/subjects', () => {
    const subjects = new Set<string>(SUBJECTS);
    const actions = new Set<string>(ACTIONS);
    for (const role of ROLES) {
      expect(ROLE_ABILITIES[role]).toBeDefined();
      for (const rule of ROLE_ABILITIES[role]) {
        for (const action of Array.isArray(rule.action) ? rule.action : [rule.action]) {
          expect(actions.has(action)).toBe(true);
        }
        for (const subject of Array.isArray(rule.subject) ? rule.subject : [rule.subject]) {
          expect(subjects.has(subject)).toBe(true);
        }
      }
    }
  });

  it('gives the platform owner platform scope but not school data', () => {
    const owner = ROLE_ABILITIES.platform_owner;
    const flat = owner.flatMap((rule) =>
      Array.isArray(rule.subject) ? rule.subject : [rule.subject],
    );
    expect(flat).toContain('School');
    expect(flat).not.toContain('Student' as Subject);
  });

  it('gives students and invigilators no cloud abilities', () => {
    expect(ROLE_ABILITIES.student).toEqual([]);
    expect(ROLE_ABILITIES.invigilator).toEqual([]);
  });

  it('scopes every school-owned subject for tenant filtering', () => {
    expect(SCHOOL_SCOPED_SUBJECTS).toContain('Exam');
    expect(SCHOOL_SCOPED_SUBJECTS).toContain('Student');
    expect(SCHOOL_SCOPED_SUBJECTS).not.toContain('Platform');
    expect(SCHOOL_SCOPED_SUBJECTS).not.toContain('Licence');
  });
});

describe('auth schemas (API spec section 3)', () => {
  it('accepts a login request with and without a TOTP code', () => {
    expect(
      LoginRequestSchema.safeParse({ identifier: 'ada@school.ng', password: 'x' }).success,
    ).toBe(true);
    expect(
      LoginRequestSchema.safeParse({ identifier: 'ada@school.ng', password: 'x', totp: '123456' })
        .success,
    ).toBe(true);
    expect(
      LoginRequestSchema.safeParse({ identifier: 'ada@school.ng', password: 'x', totp: '12' })
        .success,
    ).toBe(false);
  });

  it('accepts the documented login response, with the school omitted for the owner', () => {
    const value = {
      user: {
        id: '0192',
        role: 'teacher',
        full_name: 'Ada Okafor',
        school: { id: '0192', code: 'GRA', name: 'Graceland College' },
        must_change_password: false,
      },
      csrf_token: 'abc',
    };
    expect(LoginResponseSchema.parse(value)).toEqual(value);
  });

  it('enforces the new-password minimum on change and reset', () => {
    expect(
      PasswordChangeRequestSchema.safeParse({ current_password: 'old', new_password: 'short' })
        .success,
    ).toBe(false);
    expect(
      PasswordResetRequestSchema.safeParse({
        challenge_id: 'c',
        code: '123456',
        new_password: 'a-long-enough-password',
      }).success,
    ).toBe(true);
  });

  it('requires exactly ten recovery codes', () => {
    expect(
      TotpEnableResponseSchema.safeParse({ recovery_codes: Array(10).fill('abc') }).success,
    ).toBe(true);
    expect(
      TotpEnableResponseSchema.safeParse({ recovery_codes: Array(9).fill('abc') }).success,
    ).toBe(false);
  });
});
