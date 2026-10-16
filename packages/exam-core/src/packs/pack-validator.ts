import {
  createDecipheriv,
  createHash,
  createPublicKey,
  verify as edVerify,
} from 'node:crypto';
import { sha256Hex } from '../crypto/sha256';
import type {
  PackKeys,
  PackManifest,
  PackQuestion,
  PackSignature,
  PackVerificationFailure,
  PackVerificationResult,
  PackFailureCode,
} from './types';
import { PACK_FORMAT_VERSION } from './types';
import { readZip } from './zip';

const decoder = new TextDecoder();

export interface VerifyPackOptions {
  /** Cloud public key (PEM) the manifest signature is checked against. */
  publicKeyPem: string;
  /** When set, the pack is refused unless its `school_id` matches. */
  expectedSchoolId?: string;
  /** Format versions this verifier understands. Defaults to the current one. */
  knownFormatVersions?: number[];
  /**
   * When supplied, the encrypted key list is decrypted and checked to contain a
   * key for every question. Without it this step is skipped.
   */
  packKey?: Uint8Array;
}

function decryptKeys(packKey: Uint8Array, payload: Uint8Array, nonce: Uint8Array, aad: string): Uint8Array {
  const tag = payload.subarray(payload.length - 16);
  const ciphertext = payload.subarray(0, payload.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', packKey, nonce);
  decipher.setAAD(new TextEncoder().encode(aad));
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
}

/**
 * Verify a pack, collecting every named failure (API spec 14.4). The checks run
 * in spec order; the pack is acceptable only when `ok` is true.
 */
export function verifyPack(pack: Uint8Array, options: VerifyPackOptions): PackVerificationResult {
  const failures: PackVerificationFailure[] = [];
  const fail = (code: PackFailureCode, message: string): void => {
    failures.push({ code, message });
  };

  let entries: Map<string, Uint8Array>;
  try {
    entries = new Map(readZip(pack).map((entry) => [entry.path, entry.data]));
  } catch (error) {
    return {
      ok: false,
      failures: [{ code: 'PACK_NOT_ZIP', message: error instanceof Error ? error.message : 'Not a ZIP archive' }],
    };
  }

  const manifestBytes = entries.get('manifest.json');
  if (!manifestBytes) {
    fail('MANIFEST_MISSING', 'The pack has no manifest.json');
    return { ok: false, failures };
  }

  let manifest: PackManifest;
  try {
    manifest = JSON.parse(decoder.decode(manifestBytes)) as PackManifest;
  } catch {
    fail('MANIFEST_INVALID', 'manifest.json is not valid JSON');
    return { ok: false, failures };
  }

  if (
    !manifest ||
    typeof manifest !== 'object' ||
    typeof manifest.format_version !== 'number' ||
    typeof manifest.school_id !== 'string' ||
    !Array.isArray(manifest.files) ||
    !manifest.keys
  ) {
    fail('MANIFEST_INVALID', 'manifest.json is missing required fields');
    return { ok: false, failures, manifest };
  }

  const known = options.knownFormatVersions ?? [PACK_FORMAT_VERSION];
  if (!known.includes(manifest.format_version)) {
    fail('FORMAT_VERSION_UNKNOWN', `Pack format version ${manifest.format_version} is not supported`);
  }

  const signatureBytes = entries.get('signature.json');
  if (!signatureBytes) {
    fail('SIGNATURE_MISSING', 'The pack has no signature.json');
  } else {
    try {
      const signature = JSON.parse(decoder.decode(signatureBytes)) as PackSignature;
      const digest = createHash('sha256').update(manifestBytes).digest();
      const valid =
        signature.alg === 'Ed25519' &&
        edVerify(null, digest, createPublicKey(options.publicKeyPem), Buffer.from(signature.signature, 'base64'));
      if (!valid) {
        fail('SIGNATURE_INVALID', 'The manifest signature is not valid');
      }
    } catch {
      fail('SIGNATURE_INVALID', 'The manifest signature could not be read');
    }
  }

  for (const file of manifest.files) {
    const data = entries.get(file.path);
    if (!data) {
      fail('FILE_MISSING', `Listed file is missing: ${file.path}`);
      continue;
    }
    if (sha256Hex(data) !== file.sha256) {
      fail('FILE_HASH_MISMATCH', `Hash mismatch for ${file.path}`);
    }
  }

  if (options.expectedSchoolId && manifest.school_id !== options.expectedSchoolId) {
    fail('SCHOOL_MISMATCH', 'The pack belongs to a different school');
  }

  if (options.packKey) {
    const keysEnc = entries.get(manifest.keys.file);
    const questionsBytes = entries.get('questions.json');
    if (!keysEnc || !questionsBytes) {
      fail('FILE_MISSING', 'The pack is missing questions.json or keys.enc');
    } else {
      try {
        const plaintext = decryptKeys(
          options.packKey,
          keysEnc,
          Buffer.from(manifest.keys.nonce, 'base64'),
          manifest.keys.aad,
        );
        const keys = JSON.parse(decoder.decode(plaintext)) as PackKeys;
        const questions = JSON.parse(decoder.decode(questionsBytes)) as PackQuestion[];
        const missing = questions.filter((question) => !keys[question.question_id]);
        if (missing.length > 0) {
          fail('KEYS_INCOMPLETE', `keys.enc has no key for ${missing.length} question(s)`);
        }
      } catch {
        fail('KEYS_DECRYPT_FAILED', 'keys.enc could not be decrypted with the supplied pack key');
      }
    }
  }

  return { ok: failures.length === 0, failures, manifest };
}
