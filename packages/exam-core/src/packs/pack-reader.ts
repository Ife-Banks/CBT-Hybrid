import { createDecipheriv } from 'node:crypto';
import type { PackKeys, PackManifest, PackQuestion, PackSignature } from './types';
import { readZip } from './zip';

const decoder = new TextDecoder();

/** A `.cbtpack` opened for use (see {@link readPack}). */
export interface PackContents {
  manifest: PackManifest;
  questions: PackQuestion[];
  /** Marking keys, present only when a pack key was supplied. */
  keys?: PackKeys;
  signature?: PackSignature;
  /**
   * Raw entry bytes keyed by in-archive path, including `assets/*`. The
   * manifest and signature are included too, so callers can re-hash them.
   */
  files: Map<string, Uint8Array>;
}

/** Options for {@link readPack}. */
export interface ReadPackOptions {
  /**
   * The 32-byte pack key. When supplied, `keys.enc` is decrypted into
   * {@link PackContents.keys}. Without it the pack is read but not decrypted.
   */
  packKey?: Uint8Array;
}

/**
 * Decrypt the `keys.enc` payload. The layout is
 * `ciphertext || 16-byte GCM tag`, with the manifest's `nonce` and `aad`.
 */
export function decryptKeysFile(
  payload: Uint8Array,
  packKey: Uint8Array,
  nonce: Uint8Array,
  aad: string,
): PackKeys {
  const tag = payload.subarray(payload.length - 16);
  const ciphertext = payload.subarray(0, payload.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', packKey, nonce);
  decipher.setAAD(new TextEncoder().encode(aad));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decoder.decode(plaintext)) as PackKeys;
}

/**
 * Open a pack archive into its parts. This parses structure only; use
 * {@link verifyPack} to check the signature, hashes and school before trusting
 * it. Throws when the archive is not a ZIP or lacks the required files.
 */
export function readPack(pack: Uint8Array, options: ReadPackOptions = {}): PackContents {
  const files = new Map(readZip(pack).map((entry) => [entry.path, entry.data]));

  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes) {
    throw new Error('The pack has no manifest.json');
  }
  const manifest = JSON.parse(decoder.decode(manifestBytes)) as PackManifest;

  const questionsBytes = files.get('questions.json');
  if (!questionsBytes) {
    throw new Error('The pack has no questions.json');
  }
  const questions = JSON.parse(decoder.decode(questionsBytes)) as PackQuestion[];

  const signatureBytes = files.get('signature.json');
  const signature = signatureBytes
    ? (JSON.parse(decoder.decode(signatureBytes)) as PackSignature)
    : undefined;

  const contents: PackContents = { manifest, questions, signature, files };

  if (options.packKey) {
    const keysEnc = files.get(manifest.keys.file);
    if (!keysEnc) {
      throw new Error(`The pack has no ${manifest.keys.file}`);
    }
    contents.keys = decryptKeysFile(
      keysEnc,
      options.packKey,
      Buffer.from(manifest.keys.nonce, 'base64'),
      manifest.keys.aad,
    );
  }

  return contents;
}
