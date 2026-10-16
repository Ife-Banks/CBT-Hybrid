import { createCipheriv, createHash, createPrivateKey, sign as edSign } from 'node:crypto';
import { sha256Hex } from '../crypto/sha256';
import { canonicalJson } from './canonical-json';
import { buildKeysFile } from './keys-file';
import { buildQuestionsFile } from './questions-file';
import type {
  BuildPackInput,
  BuiltPack,
  PackManifest,
  PackManifestFile,
  PackSignature,
} from './types';
import { PACK_FORMAT_VERSION } from './types';
import { writeZip, type ZipEntry } from './zip';

const encoder = new TextEncoder();

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Deterministic GCM nonce for a pack: the first 12 bytes of
 * `SHA-256(pack_id|version|key_version|nonce)`. A pack key is only ever used
 * once per pack, so a derived nonce is safe and keeps builds reproducible.
 */
export function derivePackNonce(packId: string, version: number, keyVersion: number): Uint8Array {
  const digest = createHash('sha256').update(`${packId}|${version}|${keyVersion}|nonce`).digest();
  return new Uint8Array(digest.subarray(0, 12));
}

function encryptKeys(packKey: Uint8Array, plaintext: Uint8Array, nonce: Uint8Array, aad: string): Uint8Array {
  const cipher = createCipheriv('aes-256-gcm', packKey, nonce);
  cipher.setAAD(encoder.encode(aad));
  return new Uint8Array(Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]));
}

function assetExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) return '';
  return filename.slice(dot).toLowerCase();
}

/**
 * Build a deterministic, signed exam pack.
 *
 * Given the same inputs (including `packKey` and `builtAt`) the returned bytes
 * are identical, which is what the determinism guarantee and its tests rely on.
 */
export function buildPack(input: BuildPackInput): BuiltPack {
  const formatVersion = input.formatVersion ?? PACK_FORMAT_VERSION;
  const keyVersion = input.keyVersion ?? 1;
  const builtAt = input.builtAt ?? new Date().toISOString();
  const aad = `${input.packId}|${input.version}|${keyVersion}`;

  const questions = buildQuestionsFile(input.questions);
  const keys = buildKeysFile(input.questions);

  const questionsJson = canonicalJson(questions);
  const keysBytes = encoder.encode(canonicalJson(keys));
  const nonce = derivePackNonce(input.packId, input.version, keyVersion);
  const keysEnc = encryptKeys(input.packKey, keysBytes, nonce, aad);

  const payloadFiles: ZipEntry[] = [
    { path: 'questions.json', data: encoder.encode(questionsJson) },
    { path: 'keys.enc', data: keysEnc },
  ];
  for (const asset of input.assets ?? []) {
    payloadFiles.push({ path: `assets/${asset.assetId}${assetExtension(asset.filename)}`, data: asset.data });
  }

  const files: PackManifestFile[] = payloadFiles
    .map((file) => ({ path: file.path, sha256: sha256Hex(file.data), bytes: file.data.length }))
    .sort((a, b) => compareStrings(a.path, b.path));

  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);
  const manifest: PackManifest = {
    format_version: formatVersion,
    pack_id: input.packId,
    school_id: input.schoolId,
    exam_id: input.examId,
    version: input.version,
    key_version: keyVersion,
    built_at: builtAt,
    exam: {
      title: input.exam.title,
      subject: { id: input.exam.subject.id, name: input.exam.subject.name },
      section: input.exam.section,
      duration_min: input.exam.durationMin,
      instructions_html: input.exam.instructionsHtml ?? '',
      shuffle_questions: input.exam.shuffleQuestions,
      shuffle_options: input.exam.shuffleOptions,
      show_score_to_student: input.exam.showScoreToStudent,
      question_count: questions.length,
      total_marks: totalMarks,
    },
    files,
    keys: {
      alg: 'AES-256-GCM',
      file: 'keys.enc',
      nonce: Buffer.from(nonce).toString('base64'),
      aad,
    },
  };

  const manifestBytes = encoder.encode(canonicalJson(manifest));
  const digest = createHash('sha256').update(manifestBytes).digest();
  const signature: PackSignature = {
    alg: 'Ed25519',
    key_id: input.signingKeyId,
    signature: edSign(null, digest, createPrivateKey(input.signingPrivateKeyPem)).toString('base64'),
  };

  const bytes = writeZip([
    { path: 'manifest.json', data: manifestBytes },
    { path: 'signature.json', data: encoder.encode(canonicalJson(signature)) },
    ...payloadFiles,
  ]);

  return {
    manifest,
    signature,
    questions,
    keys,
    bytes,
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.length,
  };
}
