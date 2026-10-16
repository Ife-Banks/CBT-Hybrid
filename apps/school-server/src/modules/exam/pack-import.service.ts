import { Inject, Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256Hex, readPack, verifyPack, type PackContents, type PackManifest } from '@cbt/exam-core';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { problem } from '../../common/http/problem';
import { CATALOG_REPOSITORY, type CatalogRepository } from './repositories/catalog.repository';
import { PACK_REPOSITORY, type PackRepository } from './repositories/pack.repository';
import { META_KEYS, PACK_KEY_PREFIX, META_REPOSITORY, type MetaRepository } from './repositories/meta.repository';
import type { PackRecord } from './domain/types';

/** File name the imported pack is stored under inside its directory. */
export const PACK_FILE_NAME = 'pack.cbtpack';

export interface ImportPackInput {
  /** Raw `.cbtpack` bytes. */
  bytes: Uint8Array;
  /** The 32-byte pack key that decrypts `keys.enc`. */
  packKey: Uint8Array;
}

export interface ImportedPack {
  pack: PackRecord;
  manifest: PackManifest;
}

/**
 * Imports a signed exam pack onto the school server: verifies it against the
 * cloud public key and this school, stores it in the `active` pack folder and
 * records its exam, subject and pack rows. The pack data key is kept in `meta`
 * so the session service can decrypt marking keys and serve questions.
 *
 * Phase 8 replaces the local pack-key storage with the device-key wrapping
 * described in API spec 13.6; the interface here stays the same.
 */
@Injectable()
export class PackImportService {
  /**
   * Parsed pack contents by pack id. Auto-save reads the question list on
   * every batch, so the pack is parsed once and reused; the keys are filled in
   * the first time a caller asks for them.
   */
  private readonly cache = new Map<string, PackContents>();

  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly catalogRepo: CatalogRepository,
    @Inject(PACK_REPOSITORY) private readonly packRepo: PackRepository,
    @Inject(META_REPOSITORY) private readonly metaRepo: MetaRepository,
    private readonly config: SchoolConfigService,
  ) {}

  async importPack(input: ImportPackInput): Promise<ImportedPack> {
    const [schoolId, publicKeyPem] = await Promise.all([
      this.metaRepo.get(META_KEYS.schoolId),
      this.metaRepo.get(META_KEYS.cloudPublicKey),
    ]);

    if (!publicKeyPem) {
      throw problem('CONFLICT', 'Cloud public key is not configured (meta.cloud_public_key)');
    }

    const verification = verifyPack(input.bytes, {
      publicKeyPem,
      expectedSchoolId: schoolId ?? undefined,
      packKey: input.packKey,
    });
    if (!verification.ok) {
      const codes = verification.failures.map((failure) => failure.code).join(', ');
      throw problem('VALIDATION_FAILED', `Pack verification failed: ${codes}`);
    }

    const contents = readPack(input.bytes, { packKey: input.packKey });
    const manifest = contents.manifest;

    const dir = join(this.config.examPackFolders.active, manifest.pack_id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, PACK_FILE_NAME), input.bytes);

    const syncedAt = new Date().toISOString();
    await this.catalogRepo.upsertSubject({
      id: manifest.exam.subject.id,
      name: manifest.exam.subject.name,
      code: null,
    });
    await this.catalogRepo.upsertExam({
      id: manifest.exam_id,
      title: manifest.exam.title,
      subjectId: manifest.exam.subject.id,
      durationMin: manifest.exam.duration_min,
      settings: {
        shuffle_questions: manifest.exam.shuffle_questions,
        shuffle_options: manifest.exam.shuffle_options,
        show_score_to_student: manifest.exam.show_score_to_student,
        instructions_html: manifest.exam.instructions_html,
        pass_mark: null,
      },
      syncedAt,
    });

    const record: PackRecord = {
      id: manifest.pack_id,
      examId: manifest.exam_id,
      version: manifest.version,
      keyVersion: manifest.key_version,
      dirPath: dir,
      sha256: sha256Hex(input.bytes),
      verified: true,
      questionCount: contents.questions.length,
      totalMarks: manifest.exam.total_marks,
      downloadedAt: syncedAt,
    };

    const existing = await this.packRepo.findByExamAndVersion(
      manifest.exam_id,
      manifest.version,
    );
    if (existing) {
      await this.packRepo.setVerified(existing.id, true);
    } else {
      await this.packRepo.create(record);
    }

    await this.metaRepo.set(
      PACK_KEY_PREFIX + manifest.pack_id,
      Buffer.from(input.packKey).toString('base64'),
    );

    this.cache.delete(manifest.pack_id);
    return { pack: record, manifest };
  }

  /** Get the directory path for a pack (for asset serving). */
  getPackDir(packId: string): string {
    return join(this.config.examPackFolders.active, packId);
  }

  /** Re-open an imported pack. Set `withKeys` to decrypt marking keys too. */
  async loadPack(
    packId: string,
    options: { withKeys: boolean } = { withKeys: false },
  ): Promise<PackContents> {
    const cached = this.cache.get(packId);
    if (cached && (!options.withKeys || cached.keys)) return cached;

    const pack = await this.packRepo.findById(packId);
    if (!pack) {
      throw problem('NOT_FOUND', `Pack ${packId} has not been imported`);
    }

    const bytes = await readFile(join(pack.dirPath, PACK_FILE_NAME));

    let packKey: Uint8Array | undefined;
    if (options.withKeys) {
      const stored = await this.metaRepo.get(PACK_KEY_PREFIX + packId);
      if (!stored) {
        throw problem('CONFLICT', `Pack key for ${packId} is not available`);
      }
      packKey = Buffer.from(stored, 'base64');
    }

    const contents = readPack(bytes, { packKey });
    const merged: PackContents = { ...contents, keys: contents.keys ?? cached?.keys };
    this.cache.set(packId, merged);
    return merged;
  }

  /** Drop a pack from the in-memory cache (re-import, tests). */
  clearCache(packId?: string): void {
    if (packId) this.cache.delete(packId);
    else this.cache.clear();
  }
}
