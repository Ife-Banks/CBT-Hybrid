import { describe, expect, it } from 'vitest';
import { ExamCrypto, canonicalise } from './exam-crypto';
import { hkdfSha256Hex } from './hkdf';
import { pinResetCode, pinResetMessage, verifyPinResetCode } from './pin-reset';
import { buildStringToSign, signRequest, verifySignature } from './request-signing';
import { sha256Hex } from './sha256';

const SECRET = 'test-secret-0123456789abcdef0123';

describe('sha256Hex (section 4.4 vector)', () => {
  it('hashes the empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('sync request signing (section 4.4 vector)', () => {
  const method = 'GET';
  const path = '/sync/v1/changes?since=0&limit=500';
  const timestamp = 1760000000;
  const nonce = 'AAAAAAAAAAAAAAAAAAAAAA';

  it('builds the six-line string_to_sign', () => {
    expect(buildStringToSign(method, path, timestamp, nonce, '')).toBe(
      [
        'v1',
        'GET',
        '/sync/v1/changes?since=0&limit=500',
        '1760000000',
        'AAAAAAAAAAAAAAAAAAAAAA',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      ].join('\n'),
    );
  });

  it('produces the exact signature', () => {
    expect(signRequest(SECRET, method, path, timestamp, nonce, '')).toBe(
      '937eb643235c3c13a5a48f6e41558ea5ec8b8e840e261bb52137fbac985ca8de',
    );
  });

  it('verifies a good signature and rejects a tampered one', () => {
    const signature = signRequest(SECRET, method, path, timestamp, nonce, '');
    expect(verifySignature(SECRET, method, path, timestamp, nonce, '', signature)).toBe(true);
    expect(verifySignature(SECRET, method, path, timestamp + 1, nonce, '', signature)).toBe(false);
  });
});

describe('PIN reset code (section 4.4 vector)', () => {
  it('builds the message from the hour counter', () => {
    expect(pinResetMessage(1760000000)).toBe('pin-reset|488888');
  });

  it('produces the exact code', () => {
    expect(pinResetCode(SECRET, 1760000000)).toBe('13232082');
  });

  it('verifies good codes and rejects bad ones', () => {
    expect(verifyPinResetCode(SECRET, 1760000000, '13232082')).toBe(true);
    expect(verifyPinResetCode(SECRET, 1760000000, '00000000')).toBe(false);
  });

  it('accepts the previous hour code, but not two hours back', () => {
    // 1760003600 is the next hour, so its previous hour is 1760000000.
    expect(verifyPinResetCode(SECRET, 1760003600, '13232082')).toBe(true);
    expect(verifyPinResetCode(SECRET, 1760007200, '13232082')).toBe(false);
  });
});

describe('HKDF (section 4.4 vector)', () => {
  it('derives the pack KEK', () => {
    expect(hkdfSha256Hex(SECRET, 'pack-1', 'cbt-pack-key-v1', 32)).toBe(
      '277a3953f4179adeb8b609e602ae910cf446606bdf14238db36eac026ffd7c70',
    );
  });
});

describe('ExamCrypto pack primitives', () => {
  const crypto = new ExamCrypto();

  it('signs and verifies a manifest (Ed25519)', () => {
    const { publicKeyPem, privateKeyPem } = crypto.generateSigningKeyPair();
    const manifest = { school_id: 'GRA', exam_id: 'E-1', questions: 40 };
    const signature = crypto.signPackManifest(manifest, privateKeyPem);
    expect(crypto.verifyPackSignature(manifest, signature, publicKeyPem)).toBe(true);
    expect(
      crypto.verifyPackSignature({ ...manifest, questions: 41 }, signature, publicKeyPem),
    ).toBe(false);
  });

  it('round-trips AES-256-GCM', () => {
    const key = crypto.deriveKek(SECRET, 'pack-1', 'cbt-pack-key-v1', 32);
    const payload = crypto.encrypt(key, 'top secret keys');
    expect(crypto.decrypt(key, payload).toString()).toBe('top secret keys');
    const wrongKey = crypto.deriveKek(SECRET, 'pack-2', 'cbt-pack-key-v1', 32);
    expect(() => crypto.decrypt(wrongKey, payload)).toThrow();
  });

  it('canonicalise sorts object keys deterministically', () => {
    expect(canonicalise({ b: 1, a: 2 })).toBe(canonicalise({ a: 2, b: 1 }));
  });
});
