import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExamCrypto, buildPack, type BuildPackInput } from '@cbt/exam-core';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { PACK_FILE_NAME, PackImportService } from './pack-import.service';
import { PACK_KEY_PREFIX } from './repositories/meta.repository';
import type { CatalogRepository } from './repositories/catalog.repository';
import type { PackRepository } from './repositories/pack.repository';
import type { MetaRepository } from './repositories/meta.repository';

const crypto = new ExamCrypto();
const { privateKeyPem, publicKeyPem } = crypto.generateSigningKeyPair();
const PACK_KEY = new Uint8Array(32).fill(3);

function packInput(overrides: Partial<BuildPackInput> = {}): BuildPackInput {
  return {
    packId: 'pack-1',
    schoolId: 'school-1',
    examId: 'exam-1',
    version: 1,
    packKey: PACK_KEY,
    signingPrivateKeyPem: privateKeyPem,
    signingKeyId: 'ps-2026-1',
    builtAt: '2026-10-18T14:02:11.000Z',
    exam: {
      title: 'JSS 2 Mathematics',
      subject: { id: 'sub-1', name: 'Mathematics' },
      section: 'secondary',
      durationMin: 60,
      shuffleQuestions: true,
      shuffleOptions: true,
      showScoreToStudent: false,
    },
    questions: [
      {
        questionId: 'q-1',
        position: 1,
        type: 'single_choice',
        stem: '<p>What is 2^3?</p>',
        marks: 2,
        options: [
          { id: 'opt-a', label: 'A', body: '6', sortOrder: 1 },
          { id: 'opt-b', label: 'B', body: '8', sortOrder: 2 },
        ],
        correctOptionIds: ['opt-b'],
      },
    ],
    ...overrides,
  };
}

describe('PackImportService', () => {
  let dataDir: string;
  let config: SchoolConfigService;
  let catalog: CatalogRepository;
  let packs: PackRepository;
  let meta: MetaRepository;
  let service: PackImportService;

  let upsertSubject: ReturnType<typeof vi.fn>;
  let upsertExam: ReturnType<typeof vi.fn>;
  let createPack: ReturnType<typeof vi.fn>;
  let setVerified: ReturnType<typeof vi.fn>;
  let metaGet: ReturnType<typeof vi.fn>;
  let metaSet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'cbt-pack-'));
    process.env.CBT_DATA_DIR = dataDir;
    config = new SchoolConfigService();
    delete process.env.CBT_DATA_DIR;

    upsertSubject = vi.fn().mockResolvedValue(undefined);
    upsertExam = vi.fn().mockResolvedValue(undefined);
    createPack = vi.fn(async (record: unknown) => record);
    setVerified = vi.fn().mockResolvedValue(undefined);
    metaGet = vi.fn(async (key: string) => {
      if (key === 'school_id') return 'school-1';
      if (key === 'cloud_public_key') return publicKeyPem;
      return null;
    });
    metaSet = vi.fn().mockResolvedValue(undefined);

    catalog = { upsertSubject, upsertExam } as unknown as CatalogRepository;
    packs = {
      findByExamAndVersion: vi.fn().mockResolvedValue(null),
      create: createPack,
      setVerified,
    } as unknown as PackRepository;
    meta = { get: metaGet, set: metaSet } as unknown as MetaRepository;

    service = new PackImportService(catalog, packs, meta, config);
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('imports a valid pack, stores it in the active folder and records its exam', async () => {
    const built = buildPack(packInput());

    const result = await service.importPack({ bytes: built.bytes, packKey: PACK_KEY });

    expect(result.manifest.pack_id).toBe('pack-1');
    expect(result.pack.verified).toBe(true);
    expect(result.pack.questionCount).toBe(1);
    expect(result.pack.totalMarks).toBe(2);
    expect(result.pack.sha256).toBe(built.sha256);

    // The pack file lands in the active folder for the pack id.
    expect(existsSync(join(result.pack.dirPath, PACK_FILE_NAME))).toBe(true);
    expect(result.pack.dirPath).toBe(join(config.examPackFolders.active, 'pack-1'));

    expect(upsertSubject).toHaveBeenCalledWith({ id: 'sub-1', name: 'Mathematics', code: null });
    expect(upsertExam).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'exam-1',
        title: 'JSS 2 Mathematics',
        subjectId: 'sub-1',
        durationMin: 60,
      }),
    );
    expect(createPack).toHaveBeenCalledWith(expect.objectContaining({ id: 'pack-1', version: 1 }));

    // The pack key is stored so marking keys can be decrypted later.
    expect(metaSet).toHaveBeenCalledWith(
      PACK_KEY_PREFIX + 'pack-1',
      Buffer.from(PACK_KEY).toString('base64'),
    );
  });

  it('refuses a pack signed for another school', async () => {
    const built = buildPack(packInput({ schoolId: 'school-2' }));

    await expect(service.importPack({ bytes: built.bytes, packKey: PACK_KEY })).rejects.toThrow(
      HttpException,
    );
    expect(createPack).not.toHaveBeenCalled();
  });

  it('requires the cloud public key to be configured', async () => {
    metaGet.mockImplementation(async (key: string) => (key === 'school_id' ? 'school-1' : null));
    const built = buildPack(packInput());

    await expect(service.importPack({ bytes: built.bytes, packKey: PACK_KEY })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('fails verification when the pack key is wrong', async () => {
    const built = buildPack(packInput());

    await expect(
      service.importPack({ bytes: built.bytes, packKey: new Uint8Array(32).fill(9) }),
    ).rejects.toThrow(HttpException);
  });

  it('marks an already-imported version as verified instead of duplicating it', async () => {
    (packs.findByExamAndVersion as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'pack-1' });
    const built = buildPack(packInput());

    await service.importPack({ bytes: built.bytes, packKey: PACK_KEY });

    expect(setVerified).toHaveBeenCalledWith('pack-1', true);
    expect(createPack).not.toHaveBeenCalled();
  });
});
