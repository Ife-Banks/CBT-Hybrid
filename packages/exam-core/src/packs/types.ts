/**
 * Exam pack format (API spec section 14). A pack is a ZIP archive with
 * `manifest.json`, `questions.json`, `keys.enc`, `assets/` and `signature.json`.
 * These types are pure data; hashing, signing and ZIP assembly live alongside.
 */

/** Pack format version understood by this implementation. */
export const PACK_FORMAT_VERSION = 1;

/** Question types that can appear in a pack. */
export type PackQuestionType =
  | 'single_choice'
  | 'multi_choice'
  | 'true_false'
  | 'fill_blank'
  | 'essay'
  | 'matching'
  | 'ordering';

/** An answer option as shown to the student (never carries correctness). */
export interface PackOption {
  id: string;
  label: string;
  body: string;
}

/** A question as shown to the student (no answer key material). */
export interface PackQuestion {
  question_id: string;
  question_version: number;
  position: number;
  type: PackQuestionType;
  stem: string;
  options: PackOption[];
  marks: number;
  asset_ids: string[];
}

/** One entry of the manifest `files[]` list. */
export interface PackManifestFile {
  path: string;
  sha256: string;
  bytes: number;
}

/** Exam-level facts recorded in the manifest. */
export interface PackManifestExam {
  title: string;
  subject: { id: string; name: string };
  section: 'primary' | 'secondary' | 'mixed';
  duration_min: number;
  instructions_html: string;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_score_to_student: boolean;
  question_count: number;
  total_marks: number;
}

/** The canonical JSON manifest (API spec 14.2). */
export interface PackManifest {
  format_version: number;
  pack_id: string;
  school_id: string;
  exam_id: string;
  version: number;
  key_version: number;
  built_at: string;
  exam: PackManifestExam;
  files: PackManifestFile[];
  keys: {
    alg: 'AES-256-GCM';
    file: string;
    nonce: string;
    aad: string;
  };
}

/** The cloud signature over `SHA-256(manifest.json bytes)`. */
export interface PackSignature {
  alg: 'Ed25519';
  key_id: string;
  signature: string;
}

/** Marking key for `single_choice` and `true_false` questions. */
export interface PackSingleChoiceKey {
  type: 'single_choice' | 'true_false';
  marks: number;
  correct_option_ids: string[];
}

/** Marking key for `multi_choice` questions. */
export interface PackMultiChoiceKey {
  type: 'multi_choice';
  marks: number;
  correct_option_ids: string[];
}

/** Marking key for `fill_blank` questions. */
export interface PackFillBlankKey {
  type: 'fill_blank';
  marks: number;
  fill: { answers: string[]; case_sensitive: boolean };
}

/** Marking key for `essay` questions (marked by a human). */
export interface PackEssayKey {
  type: 'essay';
  marks: number;
}

/** Marking key for `ordering` questions. */
export interface PackOrderingKey {
  type: 'ordering';
  marks: number;
  correct_order: string[];
}

/** Marking key for `matching` questions. */
export interface PackMatchingKey {
  type: 'matching';
  marks: number;
  pairs: Array<{ left: string; right: string }>;
}

/** Any question marking key. */
export type PackQuestionKey =
  | PackSingleChoiceKey
  | PackMultiChoiceKey
  | PackFillBlankKey
  | PackEssayKey
  | PackOrderingKey
  | PackMatchingKey;

/** The decrypted contents of `keys.enc`: question id to marking key. */
export type PackKeys = Record<string, PackQuestionKey>;

/** A source question supplied to the pack builder. */
export interface PackBuildQuestion {
  questionId: string;
  questionVersion?: number;
  position: number;
  type: PackQuestionType;
  stem: string;
  marks: number;
  options?: Array<{ id: string; label: string; body: string; sortOrder?: number }>;
  assetIds?: string[];
  correctOptionIds?: string[];
  fillAnswers?: { answers: string[]; caseSensitive?: boolean };
  correctOrder?: string[];
  matchingPairs?: Array<{ left: string; right: string }>;
}

/** A media asset supplied to the pack builder as raw bytes. */
export interface PackBuildAsset {
  assetId: string;
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

/** Exam-level input for the pack builder. */
export interface PackBuildExam {
  title: string;
  subject: { id: string; name: string };
  section: 'primary' | 'secondary' | 'mixed';
  durationMin: number;
  instructionsHtml?: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showScoreToStudent: boolean;
}

/** Everything needed to build a pack. */
export interface BuildPackInput {
  packId: string;
  schoolId: string;
  examId: string;
  version: number;
  keyVersion?: number;
  builtAt?: string;
  formatVersion?: number;
  exam: PackBuildExam;
  questions: PackBuildQuestion[];
  assets?: PackBuildAsset[];
  /** Random 32-byte pack key used to encrypt `keys.enc`. */
  packKey: Uint8Array;
  signingPrivateKeyPem: string;
  signingKeyId: string;
}

/** A fully built pack. `bytes` is the ZIP file. */
export interface BuiltPack {
  manifest: PackManifest;
  signature: PackSignature;
  questions: PackQuestion[];
  keys: PackKeys;
  bytes: Uint8Array;
  sha256: string;
  sizeBytes: number;
}

/** Named pack verification failures (API spec 14.4). */
export type PackFailureCode =
  | 'PACK_NOT_ZIP'
  | 'MANIFEST_MISSING'
  | 'MANIFEST_INVALID'
  | 'FORMAT_VERSION_UNKNOWN'
  | 'SIGNATURE_MISSING'
  | 'SIGNATURE_INVALID'
  | 'FILE_MISSING'
  | 'FILE_HASH_MISMATCH'
  | 'SCHOOL_MISMATCH'
  | 'KEYS_DECRYPT_FAILED'
  | 'KEYS_INCOMPLETE';

export interface PackVerificationFailure {
  code: PackFailureCode;
  message: string;
}

export interface PackVerificationResult {
  ok: boolean;
  failures: PackVerificationFailure[];
  manifest?: PackManifest;
}
