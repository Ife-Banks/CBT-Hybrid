import { describe, expect, it } from 'vitest';
import { generateExamKey, hashExamKey, verifyExamKey } from './exam-key';

describe('exam key (section 4.2)', () => {
  it('generates six digits with leading zeros allowed', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(generateExamKey()).toMatch(/^\d{6}$/);
    }
  });

  it('hashes as SHA-256(sittingId + ":" + key)', () => {
    const hash = hashExamKey('sitting-1', '012345');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyExamKey('sitting-1', '012345', hash)).toBe(true);
    expect(verifyExamKey('sitting-1', '012346', hash)).toBe(false);
    expect(verifyExamKey('sitting-2', '012345', hash)).toBe(false);
  });
});
