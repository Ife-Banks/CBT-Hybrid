import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createPublicKey, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  PACK_FORMAT_VERSION,
  buildPack,
  verifyPack,
  type PackBuildAsset,
  type PackBuildQuestion,
  type PackVerificationResult,
} from '@cbt/exam-core';
import type { ExamRepository, ExamPackRepository, PackSourceRepository } from './repositories';
import {
  DrizzleExamPackRepository,
  DrizzleExamRepository,
  DrizzlePackSourceRepository,
} from './repositories';
import { PackStore } from './pack-store';
import type {
  CreateExamPackDto,
  ExamPackDomainRecord,
  PackSourceBundle,
  PackSourceQuestion,
} from './domain/types';
import { AuditService } from '../auth/audit/audit.service';

/** Injection token for the pack signing/verification configuration. */
export const EXAM_PACK_CONFIG = Symbol('EXAM_PACK_CONFIG');

/** Signing, verification and test-seam configuration for the pack service. */
export interface ExamPackConfig {
  /** Ed25519 private key (PEM) used to sign manifests. */
  signingPrivateKeyPem: string;
  /** `key_id` recorded in `signature.json`. */
  signingKeyId: string;
  /** Ed25519 public key (PEM). Derived from the private key when omitted. */
  publicKeyPem?: string;
  /** Clock override, for deterministic builds. */
  now?: () => Date;
  /** Pack-key generator override. Defaults to 32 random bytes. */
  generatePackKey?: () => Uint8Array;
  /** Asset reader override. Defaults to reading `storagePath` from disk. */
  readAsset?: (storagePath: string) => Promise<Uint8Array>;
}

export interface GeneratePackOptions {
  builtAt?: Date | string;
  packKey?: Uint8Array;
  keyVersion?: number;
  /** Fixed pack id, for deterministic builds and idempotent retries. */
  packId?: string;
}

export interface ValidatePackInput {
  schoolId: string;
  actorUserId?: string;
  packId?: string;
  bytes?: Uint8Array;
  packKey?: Uint8Array;
}

function sectionForManifest(
  section: 'primary' | 'secondary' | 'both' | undefined,
): 'primary' | 'secondary' | 'mixed' {
  if (section === 'primary' || section === 'secondary') return section;
  return 'mixed';
}

/** Coerce the question bank's free-form `fill_answers` into accepted answers. */
function normaliseFillAnswers(
  raw: Record<string, unknown> | undefined,
): { answers: string[]; caseSensitive?: boolean } {
  if (!raw) return { answers: [] };
  const value = raw['answers'];
  const answers = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : Object.values(raw).filter((item): item is string => typeof item === 'string');
  const caseSensitive = raw['case_sensitive'] ?? raw['caseSensitive'];
  return { answers, caseSensitive: caseSensitive === true };
}

/**
 * Builds, signs, stores and verifies deterministic exam packs (API spec 14).
 * The same exam content plus the same `built_at` and pack key yields identical
 * bytes; production uses a random pack key and the current time.
 */
@Injectable()
export class ExamPackService {
  constructor(
    @Optional() @Inject(DrizzlePackSourceRepository) private readonly packSourceRepo?: PackSourceRepository,
    @Optional() @Inject(DrizzleExamRepository) private readonly examRepo?: ExamRepository,
    @Optional() @Inject(DrizzleExamPackRepository) private readonly examPackRepo?: ExamPackRepository,
    @Optional() @Inject(PackStore) private readonly packStore?: PackStore,
    @Optional() private readonly auditService?: AuditService,
    @Optional() @Inject(EXAM_PACK_CONFIG) private readonly config?: ExamPackConfig,
  ) {}

  /** Build, sign and persist the next pack version for an exam. */
  async generatePack(
    examId: string,
    schoolId: string,
    actorUserId: string,
    options: GeneratePackOptions = {},
  ): Promise<ExamPackDomainRecord> {
    const exam = await this.examRepo!.findById(examId);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.schoolId !== schoolId) {
      throw new ConflictException('Exam does not belong to this school');
    }

    const bundle = await this.packSourceRepo!.gather(examId);
    if (!bundle) {
      throw new NotFoundException('Exam not found');
    }
    if (bundle.questions.length === 0) {
      throw new ConflictException('Exam has no questions to publish');
    }

    const questions = bundle.questions.map((question) => this.toBuildQuestion(question));
    for (const question of questions) {
      this.assertPublishable(question);
    }
    const assets = await this.loadAssets(bundle);

    const signing = this.getSigningConfig();
    const keyVersion = options.keyVersion ?? 1;
    const version = (await this.examPackRepo!.getLatestVersion(examId)) + 1;
    const builtAt = (options.builtAt
      ? options.builtAt instanceof Date
        ? options.builtAt
        : new Date(options.builtAt)
      : signing.now?.() ?? new Date()
    ).toISOString();
    const packKey = options.packKey ?? signing.generatePackKey?.() ?? new Uint8Array(randomBytes(32));

    const built = buildPack({
      packId: options.packId ?? randomUUID(),
      schoolId,
      examId,
      version,
      keyVersion,
      builtAt,
      formatVersion: PACK_FORMAT_VERSION,
      exam: {
        title: exam.title,
        subject: { id: bundle.subject.id, name: bundle.subject.name },
        section: sectionForManifest(bundle.subject.section),
        durationMin: exam.durationMin,
        instructionsHtml: exam.instructions ?? '',
        shuffleQuestions: exam.shuffleQuestions,
        shuffleOptions: exam.shuffleOptions,
        showScoreToStudent: exam.showScoreToStudent,
      },
      questions,
      assets,
      packKey,
      signingPrivateKeyPem: signing.signingPrivateKeyPem,
      signingKeyId: signing.signingKeyId,
    });

    const storageKey = `${schoolId}/${examId}/pack-${examId}-v${version}.cbtpack`;
    await this.packStore!.save(storageKey, built.bytes);

    const dto: CreateExamPackDto = {
      examId,
      version,
      keyVersion,
      manifest: built.manifest as unknown as Record<string, unknown>,
      storageKey,
      sizeBytes: built.sizeBytes,
      sha256: built.sha256,
      signature: built.signature.signature,
    };
    const record = await this.examPackRepo!.create(dto);

    await this.auditService!.record({
      action: 'exam.pack_built',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: record.id,
      targetType: 'exam_pack',
      detail: {
        examId,
        version,
        questionCount: built.questions.length,
        sha256: built.sha256,
        sizeBytes: built.sizeBytes,
      },
    });

    return record;
  }

  /** Pack metadata by id. */
  async getPack(packId: string): Promise<ExamPackDomainRecord> {
    const pack = await this.examPackRepo!.findById(packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    return pack;
  }

  /** All pack versions for an exam, newest first. */
  async listPacks(examId: string, schoolId: string): Promise<ExamPackDomainRecord[]> {
    const exam = await this.examRepo!.findById(examId);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.schoolId !== schoolId) {
      throw new ConflictException('Exam does not belong to this school');
    }
    return this.examPackRepo!.findByExamId(examId);
  }

  /** A pack's metadata and bytes, for the download endpoint. */
  async downloadPack(packId: string): Promise<{ pack: ExamPackDomainRecord; bytes: Uint8Array }> {
    const pack = await this.getPack(packId);
    const bytes = await this.packStore!.read(pack.storageKey);
    if (!bytes) {
      throw new NotFoundException('Pack file not found');
    }
    return { pack, bytes };
  }

  /** Verify a stored pack (by id) or raw pack bytes. */
  async validatePack(input: ValidatePackInput): Promise<PackVerificationResult> {
    let bytes = input.bytes;
    if (!bytes) {
      if (!input.packId) {
        throw new ConflictException('A pack id or pack bytes are required');
      }
      const pack = await this.getPack(input.packId);
      bytes = (await this.packStore!.read(pack.storageKey)) ?? undefined;
      if (!bytes) {
        throw new NotFoundException('Pack file not found');
      }
    }

    const result = verifyPack(bytes, {
      publicKeyPem: this.getPublicKeyPem(),
      expectedSchoolId: input.schoolId,
      packKey: input.packKey,
    });

    await this.auditService!.record({
      action: 'pack.validated',
      outcome: result.ok ? 'success' : 'failure',
      schoolId: input.schoolId,
      actorUserId: input.actorUserId,
      targetId: input.packId,
      targetType: 'exam_pack',
      detail: { ok: result.ok, failures: result.failures.map((failure) => failure.code) },
    });

    return result;
  }

  private toBuildQuestion(question: PackSourceQuestion): PackBuildQuestion {
    const build: PackBuildQuestion = {
      questionId: question.questionId,
      questionVersion: question.version,
      position: question.position,
      type: question.type,
      stem: question.stem,
      marks: question.marksOverride ?? question.marks,
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
        body: option.body,
        sortOrder: option.sortOrder,
      })),
      assetIds: question.assetIds,
    };

    if (question.type === 'single_choice' || question.type === 'multi_choice' || question.type === 'true_false') {
      build.correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);
    }
    if (question.type === 'fill_blank') {
      build.fillAnswers = normaliseFillAnswers(question.fillAnswers);
    }
    if (question.type === 'ordering') {
      build.correctOrder = question.correctOrder;
    }
    if (question.type === 'matching') {
      build.matchingPairs = question.matchingPairs;
    }
    return build;
  }

  private assertPublishable(question: PackBuildQuestion): void {
    const hasCorrectOptions = (question.correctOptionIds?.length ?? 0) > 0;
    switch (question.type) {
      case 'single_choice':
      case 'true_false':
        if (!hasCorrectOptions) {
          throw new ConflictException(`Question ${question.questionId} has no correct option`);
        }
        break;
      case 'multi_choice':
        if (!hasCorrectOptions) {
          throw new ConflictException(`Question ${question.questionId} has no correct options`);
        }
        break;
      case 'fill_blank':
        if ((question.fillAnswers?.answers.length ?? 0) === 0) {
          throw new ConflictException(`Question ${question.questionId} has no accepted answers`);
        }
        break;
      case 'ordering':
        if ((question.correctOrder?.length ?? 0) === 0) {
          throw new ConflictException(`Question ${question.questionId} has no correct order`);
        }
        break;
      case 'matching':
        if ((question.matchingPairs?.length ?? 0) === 0) {
          throw new ConflictException(`Question ${question.questionId} has no matching pairs`);
        }
        break;
      case 'essay':
        break;
    }
  }

  private async loadAssets(bundle: PackSourceBundle): Promise<PackBuildAsset[]> {
    const readAsset = this.config?.readAsset ?? ((storagePath: string) => readFile(storagePath));
    const assets: PackBuildAsset[] = [];
    for (const asset of bundle.assets) {
      const data = await readAsset(asset.storagePath);
      assets.push({
        assetId: asset.id,
        filename: asset.filename,
        mimeType: asset.mimeType,
        data: new Uint8Array(data),
      });
    }
    return assets;
  }

  private getSigningConfig(): ExamPackConfig {
    if (this.config) {
      return this.config;
    }
    const signingPrivateKeyPem = process.env.PACK_SIGNING_PRIVATE_KEY;
    if (!signingPrivateKeyPem) {
      throw new ConflictException('Pack signing key is not configured (set PACK_SIGNING_PRIVATE_KEY)');
    }
    return {
      signingPrivateKeyPem,
      signingKeyId: process.env.PACK_SIGNING_KEY_ID ?? 'ps-1',
      publicKeyPem: process.env.PACK_SIGNING_PUBLIC_KEY,
    };
  }

  private getPublicKeyPem(): string {
    if (this.config?.publicKeyPem) {
      return this.config.publicKeyPem;
    }
    const envPublicKey = process.env.PACK_SIGNING_PUBLIC_KEY;
    if (envPublicKey) {
      return envPublicKey;
    }
    const privateKey = this.config?.signingPrivateKeyPem ?? process.env.PACK_SIGNING_PRIVATE_KEY;
    if (!privateKey) {
      throw new ConflictException(
        'Pack verification key is not configured (set PACK_SIGNING_PUBLIC_KEY or PACK_SIGNING_PRIVATE_KEY)',
      );
    }
    return createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
  }
}
