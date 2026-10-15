import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign as edSign,
  verify as edVerify,
} from 'node:crypto';
import { generateExamKey, hashExamKey, verifyExamKey } from '../exam-key/exam-key';
import { hkdfSha256 } from './hkdf';
import { sha256Hex } from './sha256';

/**
 * Pack-signing canonicalisation.
 *
 * NOTE: this is a deterministic sorted-key JSON serialiser. The pack format
 * requires RFC 8785 (JCS) canonicalisation (CBT-04 section 5, API spec 14.4);
 * that is implemented with the pack builder in the exam-pack milestone. The
 * primitives here (Ed25519 sign/verify, AES-256-GCM, HKDF) are final.
 */
export function canonicalise(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return Object.fromEntries(entries.map(([k, v]) => [k, sortValue(v)]));
  }
  return value;
}

export interface SigningKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

export interface EncryptedPayload {
  /** Base64 ciphertext. */
  ciphertext: string;
  /** Base64 12-byte GCM nonce. */
  iv: string;
  /** Base64 16-byte GCM auth tag. */
  tag: string;
}

/** Cryptographic helpers for exam packs and keys. */
export class ExamCrypto {
  generateExamKey = generateExamKey;
  hashExamKey = hashExamKey;
  verifyExamKey = verifyExamKey;
  sha256Hex = sha256Hex;

  /** Derive a 32-byte key-encryption key with HKDF-SHA256. */
  deriveKek(ikm: string | Uint8Array, salt: string, info: string, length = 32): Buffer {
    return hkdfSha256(ikm, salt, info, length);
  }

  /** Generate an Ed25519 signing key pair (PEM). */
  generateSigningKeyPair(): SigningKeyPair {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    return {
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    };
  }

  /** Sign a pack manifest with an Ed25519 private key (PEM). Returns base64. */
  signPackManifest(manifest: unknown, privateKeyPem: string): string {
    const data = Buffer.from(canonicalise(manifest));
    return edSign(null, data, createPrivateKey(privateKeyPem)).toString('base64');
  }

  /** Verify a pack manifest signature with an Ed25519 public key (PEM). */
  verifyPackSignature(manifest: unknown, signature: string, publicKeyPem: string): boolean {
    const data = Buffer.from(canonicalise(manifest));
    return edVerify(null, data, createPublicKey(publicKeyPem), Buffer.from(signature, 'base64'));
  }

  /** Encrypt with AES-256-GCM using a 32-byte key. */
  encrypt(key: Buffer, plaintext: string | Uint8Array): EncryptedPayload {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }

  /** Decrypt with AES-256-GCM using a 32-byte key. */
  decrypt(key: Buffer, payload: EncryptedPayload): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);
  }
}
