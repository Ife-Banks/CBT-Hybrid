import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes with argon2id and verifies the right password', async () => {
    const encoded = await passwords.hash('TestPassword123!');
    expect(encoded.startsWith('$argon2id$')).toBe(true);
    // CBT-04 section 3.6 parameters: m=19456, t=2, p=1 (node-argon2 ordering).
    expect(encoded).toContain('m=19456,p=1,t=2');
    expect(await passwords.verify(encoded, 'TestPassword123!')).toBe(true);
    expect(await passwords.verify(encoded, 'wrong-password')).toBe(false);
  });

  it('generates a fresh salt each time', async () => {
    const first = await passwords.hash('TestPassword123!');
    const second = await passwords.hash('TestPassword123!');
    expect(first).not.toBe(second);
  });

  it('treats a corrupt hash as a failed verification rather than throwing', async () => {
    expect(await passwords.verify('not-a-hash', 'TestPassword123!')).toBe(false);
    expect(await passwords.verify('', 'TestPassword123!')).toBe(false);
  });

  it('never fails the dummy verification used to equalise timing', async () => {
    await expect(passwords.verifyDummy('anything')).resolves.toBeUndefined();
  });

  it('applies the shared password policy', () => {
    expect(passwords.validate('TestPassword123!')).toEqual([]);
    expect(passwords.validate('short')).toEqual([
      {
        field: 'new_password',
        code: 'TOO_SHORT',
        message: 'Password must be at least 10 characters',
      },
    ]);
    expect(passwords.validate('password123')[0]?.code).toBe('TOO_COMMON');
    expect(passwords.validate('x'.repeat(2000))[0]?.code).toBe('TOO_LONG');
  });

  it('names the field it was asked to validate', () => {
    expect(passwords.validate('short', {}, 'password')[0]?.field).toBe('password');
  });
});
