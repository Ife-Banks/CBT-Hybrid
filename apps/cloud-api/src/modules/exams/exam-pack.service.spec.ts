import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ExamCrypto, verifyPack } from '@cbt/exam-core';
import { ExamPackService, type ExamPackConfig } from './exam-pack.service';
import type { ExamRepository, ExamPackRepository, PackSourceRepository } from './repositories';
import type { ExamPackDomainRecord, PackSourceBundle } from './domain/types';
import type { PackStore } from './pack-store';

const crypto = new ExamCrypto();
const { publicKeyPem, privateKeyPem } = crypto.generateSigningKeyPair();
const PACK_KEY = new Uint8Array(32).fill(5);
const BUILT_AT = new Date('2026-01-01T00:00:00.000Z');

function examFixture() {
  return {
    id: 'exam-1',
    schoolId: 'school-1',
    title: 'JSS 2 Mathematics',
    subjectId: 'sub-1',
    kind: 'exam' as const,
    durationMin: 60,
    shuffleQuestions: true,
    shuffleOptions: true,
    negativeMarking: false,
    showScoreToStudent: false,
    status: 'ready' as const,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function bundleFixture(): PackSourceBundle {
  return {
    subject: { id: 'sub-1', name: 'Mathematics', section: 'secondary' },
    questions: [
      {
        questionId: 'q-1',
        version: 1,
        position: 1,
        type: 'single_choice',
        stem: '<p>What is 2^3?</p>',
        marks: 1,
        options: [
          { id: 'opt-a', label: 'A', body: '6', isCorrect: false, sortOrder: 1 },
          { id: 'opt-b', label: 'B', body: '8', isCorrect: true, sortOrder: 2 },
        ],
        assetIds: [],
      },
      {
        questionId: 'q-2',
        version: 1,
        position: 2,
        type: 'fill_blank',
        stem: '<p>The capital of Nigeria is ____.</p>',
        marks: 2,
        options: [],
        assetIds: [],
        fillAnswers: { answers: ['Abuja'] },
      },
    ],
    assets: [],
  };
}

describe('ExamPackService', () => {
  let service: ExamPackService;
  let packSourceRepo: PackSourceRepository;
  let examRepo: ExamRepository;
  let examPackRepo: ExamPackRepository;
  let packStore: PackStore;
  let auditService: { record: ReturnType<typeof vi.fn> };
  let config: ExamPackConfig;
  let savedPacks: Map<string, Uint8Array>;

  beforeEach(() => {
    savedPacks = new Map();

    packSourceRepo = { gather: vi.fn() } as unknown as PackSourceRepository;
    examRepo = {
      findById: vi.fn(),
    } as unknown as ExamRepository;
    examPackRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByExamId: vi.fn(),
      findByExamAndVersion: vi.fn(),
      getLatestVersion: vi.fn(),
    } as unknown as ExamPackRepository;
    packStore = {
      save: vi.fn(async (key: string, bytes: Uint8Array) => {
        savedPacks.set(key, bytes);
      }),
      read: vi.fn(async (key: string) => savedPacks.get(key) ?? null),
      delete: vi.fn(),
    } as unknown as PackStore;
    auditService = { record: vi.fn() };
    config = {
      signingPrivateKeyPem: privateKeyPem,
      signingKeyId: 'ps-test',
      publicKeyPem,
      now: () => BUILT_AT,
      generatePackKey: () => PACK_KEY,
    };

    service = new ExamPackService(
      packSourceRepo,
      examRepo,
      examPackRepo,
      packStore,
      auditService,
      config,
    );
  });

  function arrangeHappyPath(): void {
    vi.mocked(examRepo.findById).mockResolvedValue(examFixture());
    vi.mocked(packSourceRepo.gather).mockResolvedValue(bundleFixture());
    vi.mocked(examPackRepo.getLatestVersion).mockResolvedValue(0);
    vi.mocked(examPackRepo.create).mockImplementation(async (dto) => ({
      id: 'pack-1',
      ...dto,
      keyVersion: dto.keyVersion ?? 1,
      createdAt: new Date(),
    }));
  }

  describe('generatePack', () => {
    it('builds, stores, persists and audits a signed pack', async () => {
      arrangeHappyPath();

      const record = await service.generatePack('exam-1', 'school-1', 'user-1');

      expect(record.version).toBe(1);
      expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(record.signature.length).toBeGreaterThan(0);
      expect(record.storageKey).toBe('school-1/exam-1/pack-exam-1-v1.cbtpack');
      expect(packStore.save).toHaveBeenCalledOnce();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'exam.pack_built', schoolId: 'school-1', actorUserId: 'user-1' }),
      );

      const saved = savedPacks.get(record.storageKey);
      expect(saved).toBeDefined();
      const result = verifyPack(saved!, { publicKeyPem, expectedSchoolId: 'school-1', packKey: PACK_KEY });
      expect(result.failures).toEqual([]);
    });

    it('is deterministic for a fixed pack id, timestamp and key', async () => {
      arrangeHappyPath();

      const first = await service.generatePack('exam-1', 'school-1', 'user-1', { packId: 'fixed-pack' });
      const second = await service.generatePack('exam-1', 'school-1', 'user-1', { packId: 'fixed-pack' });

      expect(first.sha256).toBe(second.sha256);
      expect(Buffer.from(savedPacks.get(first.storageKey)!).equals(Buffer.from(savedPacks.get(second.storageKey)!))).toBe(true);
    });

    it('increments the version from the latest stored pack', async () => {
      arrangeHappyPath();
      vi.mocked(examPackRepo.getLatestVersion).mockResolvedValue(3);

      const record = await service.generatePack('exam-1', 'school-1', 'user-1');

      expect(record.version).toBe(4);
      expect(record.storageKey).toContain('v4');
    });

    it('throws NotFoundException when the exam does not exist', async () => {
      vi.mocked(examRepo.findById).mockResolvedValue(null);

      await expect(service.generatePack('exam-1', 'school-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the exam belongs to another school', async () => {
      vi.mocked(examRepo.findById).mockResolvedValue(examFixture());

      await expect(service.generatePack('exam-1', 'other-school', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when the exam has no questions', async () => {
      vi.mocked(examRepo.findById).mockResolvedValue(examFixture());
      vi.mocked(packSourceRepo.gather).mockResolvedValue({ ...bundleFixture(), questions: [] });

      await expect(service.generatePack('exam-1', 'school-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('refuses to publish a question with no answer key', async () => {
      const bundle = bundleFixture();
      const broken = bundle.questions[0]!;
      bundle.questions[0] = {
        ...broken,
        options: broken.options.map((option) => ({ ...option, isCorrect: false })),
      };
      vi.mocked(examRepo.findById).mockResolvedValue(examFixture());
      vi.mocked(packSourceRepo.gather).mockResolvedValue(bundle);
      vi.mocked(examPackRepo.getLatestVersion).mockResolvedValue(0);

      await expect(service.generatePack('exam-1', 'school-1', 'user-1')).rejects.toThrow(ConflictException);
      expect(packStore.save).not.toHaveBeenCalled();
    });
  });

  describe('getPack', () => {
    it('returns a stored pack', async () => {
      const pack: ExamPackDomainRecord = {
        id: 'pack-1',
        examId: 'exam-1',
        version: 1,
        keyVersion: 1,
        manifest: {},
        storageKey: 'key',
        sizeBytes: 10,
        sha256: 'abc',
        signature: 'sig',
        createdAt: new Date(),
      };
      vi.mocked(examPackRepo.findById).mockResolvedValue(pack);

      await expect(service.getPack('pack-1')).resolves.toEqual(pack);
    });

    it('throws NotFoundException for an unknown pack', async () => {
      vi.mocked(examPackRepo.findById).mockResolvedValue(null);

      await expect(service.getPack('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listPacks', () => {
    it('checks ownership before listing', async () => {
      vi.mocked(examRepo.findById).mockResolvedValue(examFixture());
      vi.mocked(examPackRepo.findByExamId).mockResolvedValue([]);

      await expect(service.listPacks('exam-1', 'school-1')).resolves.toEqual([]);
      expect(examPackRepo.findByExamId).toHaveBeenCalledWith('exam-1');
    });

    it('rejects a different school', async () => {
      vi.mocked(examRepo.findById).mockResolvedValue(examFixture());

      await expect(service.listPacks('exam-1', 'other-school')).rejects.toThrow(ConflictException);
    });
  });

  describe('validatePack', () => {
    it('verifies a stored pack and audits the outcome', async () => {
      arrangeHappyPath();
      const record = await service.generatePack('exam-1', 'school-1', 'user-1');
      vi.mocked(examPackRepo.findById).mockResolvedValue(record);

      const result = await service.validatePack({
        schoolId: 'school-1',
        actorUserId: 'user-1',
        packId: record.id,
        packKey: PACK_KEY,
      });

      expect(result.ok).toBe(true);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'pack.validated', outcome: 'success' }),
      );
    });

    it('reports a tampered pack as invalid', async () => {
      arrangeHappyPath();
      const record = await service.generatePack('exam-1', 'school-1', 'user-1');
      const tampered = savedPacks.get(record.storageKey)!.slice();
      tampered[tampered.length - 40] = tampered[tampered.length - 40]! ^ 0xff;
      savedPacks.set(record.storageKey, tampered);
      vi.mocked(examPackRepo.findById).mockResolvedValue(record);

      const result = await service.validatePack({ schoolId: 'school-1', packId: record.id });

      expect(result.ok).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    });

    it('requires a pack id or bytes', async () => {
      await expect(service.validatePack({ schoolId: 'school-1' })).rejects.toThrow(ConflictException);
    });
  });

  describe('downloadPack', () => {
    it('returns the stored bytes', async () => {
      arrangeHappyPath();
      const record = await service.generatePack('exam-1', 'school-1', 'user-1');
      vi.mocked(examPackRepo.findById).mockResolvedValue(record);

      const { bytes } = await service.downloadPack(record.id);

      expect(bytes.length).toBe(record.sizeBytes);
    });
  });
});
