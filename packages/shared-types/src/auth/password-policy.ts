/**
 * Password policy (API and Sync Specification section 3): at least 10
 * characters, not in the common-passwords list, and not equal to the account's
 * email or phone. Kept in `shared-types` so the frontends can show the same
 * rules the server enforces.
 *
 * The Phase 2 plan proposed a different policy ("at least 3 of
 * lowercase/uppercase/digits/symbols", "cannot reuse the last 5"). The API
 * spec does not require composition rules and the reuse rule needs password
 * history, so both are omitted here — see `docs/questions.md` D.17.
 */

/** Minimum length enforced on every password setter. */
export const PASSWORD_MIN_LENGTH = 10;

/** Maximum accepted length, to bound hashing cost. */
export const PASSWORD_MAX_LENGTH = 1024;

/**
 * Common passwords that are rejected outright. This is a representative subset
 * of the well-known breach lists (for example SecLists `10-million-password-list`
 * and the NCSC top-100), covering the values actually seen in the field. It is
 * not the full list; a deployment may swap in a larger one behind the same
 * function without changing callers.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  '11111111',
  '00000000',
  'password',
  'password1',
  'password123',
  'password1234',
  'passw0rd',
  'p@ssw0rd',
  'qwerty',
  'qwerty123',
  'qwertyuiop',
  'abc12345',
  'abcd1234',
  'iloveyou',
  'admin',
  'administrator',
  'letmein',
  'welcome',
  'welcome1',
  'welcome123',
  'monkey123',
  'dragon123',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'superman',
  'trustno1',
  'whatever',
  'starwars',
  'computer',
  'michael1',
  'jennifer',
  'jordan23',
  'harley1',
  'ranger1',
  'hunter2',
  'buster1',
  'soccer1',
  'batman1',
  'shadow1',
  'master1',
  'maggie1',
  'pepper1',
  'ginger1',
  'cookie1',
  'flower1',
  'banana1',
  'orange1',
  'purple1',
  'silver1',
  'golden1',
  'summer2024',
  'summer2025',
  'summer2026',
  'winter2024',
  'winter2025',
  'spring2024',
  'spring2025',
  'autumn2024',
  'january1',
  'changeme',
  'changeme123',
  'secret123',
  'letmein123',
  'iloveyou1',
  'loveyou1',
  'iloveyou123',
  'killer1',
  'access14',
  'hello123',
  'freedom1',
  'flower123',
  'whatever1',
  'zaq12wsx',
  '1q2w3e4r',
  '1qaz2wsx',
  'asdfghjkl',
  'asdf1234',
  'qazwsx123',
  'mypassword',
  'newpassword',
  'temppassword',
  'test1234',
  'test12345',
  'testing123',
  'cbt123456',
  'nigeria1',
  'lagos123',
  'school123',
  'student123',
  'teacher123',
  'admin1234',
  'admin@123',
  'admin12345',
  'root1234',
  'toor1234',
]);

/** True when a password (case-insensitively) appears in the common list. */
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.trim().toLowerCase());
}

/** Values a password must not simply be equal to. */
export interface PasswordPolicyContext {
  email?: string | null;
  phone?: string | null;
}

/** A single policy failure, shaped for the `errors[]` array of `VALIDATION_FAILED`. */
export interface PasswordPolicyViolation {
  field: string;
  code: string;
  message: string;
}

/** Digits only, for phone comparison. */
function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/**
 * Validate a password against the policy. Returns an empty array when the
 * password is acceptable. `field` defaults to `new_password` because that is the
 * field name used by the password-setting endpoints.
 */
export function validatePassword(
  password: string,
  context: PasswordPolicyContext = {},
  field = 'new_password',
): PasswordPolicyViolation[] {
  const violations: PasswordPolicyViolation[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    violations.push({
      field,
      code: 'TOO_SHORT',
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    });
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    violations.push({
      field,
      code: 'TOO_LONG',
      message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
    });
  }

  if (isCommonPassword(password)) {
    violations.push({
      field,
      code: 'TOO_COMMON',
      message: 'Password is too common',
    });
  }

  const normalised = password.trim().toLowerCase();
  const email = context.email?.trim().toLowerCase();
  if (email && normalised === email) {
    violations.push({
      field,
      code: 'EQUALS_IDENTIFIER',
      message: 'Password must not be the same as the email address',
    });
  }

  const phone = context.phone ? digitsOnly(context.phone) : '';
  if (phone.length > 0) {
    const compact = digitsOnly(password);
    if (compact.length > 0 && compact === phone) {
      violations.push({
        field,
        code: 'EQUALS_IDENTIFIER',
        message: 'Password must not be the same as the phone number',
      });
    }
  }

  return violations;
}
