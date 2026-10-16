import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ExamSchedulerService } from './exam-scheduler.service';
import type { SittingRepository, ExamRepository } from './repositories';
import type { SittingDomainRecord, ExamDomainRecord } from './domain/types';

describe('ExamSchedulerService', () => {
  let service: ExamSchedulerService;
  let sittingRepo: SittingRepository;
  let examRepo: ExamRepository;
  let auditService: any;

  beforeEach(() => {
    sittingRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findBySchoolId: vi.fn(),
      findByExamId: vi.fn(),
      findByClassId: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as SittingRepository;

    examRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findBySchoolId: vi.fn(),
      findBySubjectId: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addQuestion: vi.fn(),
      removeQuestion: vi.fn(),
      getQuestions: vi.fn(),
    } as unknown as ExamRepository;

    auditService = {
      record: vi.fn(),
      list: vi.fn(),
    };

    service = new ExamSchedulerService(sittingRepo, examRepo, auditService);
  });

  describe('openSitting', () => {
    it('should open a sitting', async () => {
      const now = new Date();
      const windowStart = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago
      const windowEnd = new Date(now.getTime() + 55 * 60 * 1000); // 55 minutes from now

      const mockSitting: SittingDomainRecord = {
        id: 'sitting-1',
        schoolId: 'school-1',
        examId: 'exam-1',
        classId: 'class-1',
        windowStart,
        windowEnd,
        extraTimeMin: 0,
        status: 'scheduled',
        createdAt: new Date(),
      };
      const mockUpdatedSitting: SittingDomainRecord = {
        ...mockSitting,
        status: 'open',
      };
      vi.mocked(sittingRepo.findById).mockResolvedValue(mockSitting);
      vi.mocked(sittingRepo.update).mockResolvedValue(mockUpdatedSitting);

      const result = await service.openSitting('sitting-1', 'school-1', 'user-1');

      expect(result).toEqual(mockUpdatedSitting);
      expect(sittingRepo.update).toHaveBeenCalledWith('sitting-1', { status: 'open' });
      expect(auditService.record).toHaveBeenCalled();
    });

    it('should throw ConflictException when opening before window start', async () => {
      const mockSitting: SittingDomainRecord = {
        id: 'sitting-1',
        schoolId: 'school-1',
        examId: 'exam-1',
        classId: 'class-1',
        windowStart: new Date('2025-01-01T09:00:00Z'),
        windowEnd: new Date('2025-01-01T11:00:00Z'),
        extraTimeMin: 0,
        status: 'scheduled',
        createdAt: new Date(),
      };
      vi.mocked(sittingRepo.findById).mockResolvedValue(mockSitting);

      await expect(service.openSitting('sitting-1', 'school-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when opening after window end', async () => {
      const mockSitting: SittingDomainRecord = {
        id: 'sitting-1',
        schoolId: 'school-1',
        examId: 'exam-1',
        classId: 'class-1',
        windowStart: new Date('2020-01-01T09:00:00Z'),
        windowEnd: new Date('2020-01-01T11:00:00Z'),
        extraTimeMin: 0,
        status: 'scheduled',
        createdAt: new Date(),
      };
      vi.mocked(sittingRepo.findById).mockResolvedValue(mockSitting);

      await expect(service.openSitting('sitting-1', 'school-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when opening non-scheduled sitting', async () => {
      const mockSitting: SittingDomainRecord = {
        id: 'sitting-1',
        schoolId: 'school-1',
        examId: 'exam-1',
        classId: 'class-1',
        windowStart: new Date('2024-01-01T09:00:00Z'),
        windowEnd: new Date('2024-01-01T11:00:00Z'),
        extraTimeMin: 0,
        status: 'open',
        createdAt: new Date(),
      };
      vi.mocked(sittingRepo.findById).mockResolvedValue(mockSitting);

      await expect(service.openSitting('sitting-1', 'school-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('closeSitting', () => {
    it('should close a sitting', async () => {
      const mockSitting: SittingDomainRecord = {
        id: 'sitting-1',
        schoolId: 'school-1',
        examId: 'exam-1',
        classId: 'class-1',
        windowStart: new Date('2024-01-01T09:00:00Z'),
        windowEnd: new Date('2024-01-01T11:00:00Z'),
        extraTimeMin: 0,
        status: 'open',
        createdAt: new Date(),
      };
      const mockUpdatedSitting: SittingDomainRecord = {
        ...mockSitting,
        status: 'closed',
      };
      vi.mocked(sittingRepo.findById).mockResolvedValue(mockSitting);
      vi.mocked(sittingRepo.update).mockResolvedValue(mockUpdatedSitting);

      const result = await service.closeSitting('sitting-1', 'school-1', 'user-1');

      expect(result).toEqual(mockUpdatedSitting);
      expect(sittingRepo.update).toHaveBeenCalledWith('sitting-1', { status: 'closed' });
      expect(auditService.record).toHaveBeenCalled();
    });

    it('should throw ConflictException when closing non-open sitting', async () => {
      const mockSitting: SittingDomainRecord = {
        id: 'sitting-1',
        schoolId: 'school-1',
        examId: 'exam-1',
        classId: 'class-1',
        windowStart: new Date('2024-01-01T09:00:00Z'),
        windowEnd: new Date('2024-01-01T11:00:00Z'),
        extraTimeMin: 0,
        status: 'scheduled',
        createdAt: new Date(),
      };
      vi.mocked(sittingRepo.findById).mockResolvedValue(mockSitting);

      await expect(service.closeSitting('sitting-1', 'school-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('cancelSitting', () => {
    it('should cancel a sitting', async () => {
      const mockSitting: SittingDomainRecord = {
        id: 'sitting-1',
        schoolId: 'school-1',
        examId: 'exam-1',
        classId: 'class-1',
        windowStart: new Date('2024-01-01T09:00:00Z'),
        windowEnd: new Date('2024-01-01T11:00:00Z'),
        extraTimeMin: 0,
        status: 'scheduled',
        createdAt: new Date(),
      };
      const mockUpdatedSitting: SittingDomainRecord = {
        ...mockSitting,
        status: 'cancelled',
      };
      vi.mocked(sittingRepo.findById).mockResolvedValue(mockSitting);
      vi.mocked(sittingRepo.update).mockResolvedValue(mockUpdatedSitting);

      const result = await service.cancelSitting('sitting-1', 'school-1', 'user-1');

      expect(result).toEqual(mockUpdatedSitting);
      expect(sittingRepo.update).toHaveBeenCalledWith('sitting-1', { status: 'cancelled' });
      expect(auditService.record).toHaveBeenCalled();
    });

    it('should throw ConflictException when cancelling closed sitting', async () => {
      const mockSitting: SittingDomainRecord = {
        id: 'sitting-1',
        schoolId: 'school-1',
        examId: 'exam-1',
        classId: 'class-1',
        windowStart: new Date('2024-01-01T09:00:00Z'),
        windowEnd: new Date('2024-01-01T11:00:00Z'),
        extraTimeMin: 0,
        status: 'closed',
        createdAt: new Date(),
      };
      vi.mocked(sittingRepo.findById).mockResolvedValue(mockSitting);

      await expect(service.cancelSitting('sitting-1', 'school-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('scheduleBulkSittings', () => {
    it('should schedule bulk sittings', async () => {
      const mockExam: ExamDomainRecord = {
        id: 'exam-1',
        schoolId: 'school-1',
        title: 'Math Test',
        subjectId: 'subject-1',
        kind: 'exam',
        durationMin: 60,
        shuffleQuestions: true,
        shuffleOptions: true,
        negativeMarking: false,
        showScoreToStudent: false,
        status: 'draft',
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockSitting1: SittingDomainRecord = {
        id: 'sitting-1',
        schoolId: 'school-1',
        examId: 'exam-1',
        classId: 'class-1',
        windowStart: new Date('2024-01-01T09:00:00Z'),
        windowEnd: new Date('2024-01-01T11:00:00Z'),
        extraTimeMin: 0,
        status: 'scheduled',
        createdAt: new Date(),
      };
      const mockSitting2: SittingDomainRecord = {
        id: 'sitting-2',
        schoolId: 'school-1',
        examId: 'exam-1',
        classId: 'class-2',
        windowStart: new Date('2024-01-01T09:00:00Z'),
        windowEnd: new Date('2024-01-01T11:00:00Z'),
        extraTimeMin: 0,
        status: 'scheduled',
        createdAt: new Date(),
      };
      vi.mocked(examRepo.findById).mockResolvedValue(mockExam);
      vi.mocked(sittingRepo.create).mockResolvedValue(mockSitting1);
      let callCount = 0;
      vi.mocked(sittingRepo.create).mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? mockSitting1 : mockSitting2;
      });

      const result = await service.scheduleBulkSittings(
        'exam-1',
        ['class-1', 'class-2'],
        new Date('2024-01-01T09:00:00Z'),
        new Date('2024-01-01T11:00:00Z'),
        0,
        'school-1',
        'user-1',
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockSitting1);
      expect(result[1]).toEqual(mockSitting2);
      expect(sittingRepo.create).toHaveBeenCalledTimes(2);
      expect(auditService.record).toHaveBeenCalled();
    });

    it('should throw NotFoundException when exam not found', async () => {
      vi.mocked(examRepo.findById).mockResolvedValue(null);

      await expect(
        service.scheduleBulkSittings(
          'exam-1',
          ['class-1'],
          new Date('2024-01-01T09:00:00Z'),
          new Date('2024-01-01T11:00:00Z'),
          0,
          'school-1',
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUpcomingSittings', () => {
    it('should get upcoming sittings', async () => {
      const now = new Date();
      const future1 = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
      const future2 = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now

      const mockSittings: SittingDomainRecord[] = [
        {
          id: 'sitting-1',
          schoolId: 'school-1',
          examId: 'exam-1',
          classId: 'class-1',
          windowStart: future1,
          windowEnd: new Date(future1.getTime() + 60 * 60 * 1000),
          extraTimeMin: 0,
          status: 'scheduled',
          createdAt: new Date(),
        },
        {
          id: 'sitting-2',
          schoolId: 'school-1',
          examId: 'exam-1',
          classId: 'class-2',
          windowStart: future2,
          windowEnd: new Date(future2.getTime() + 60 * 60 * 1000),
          extraTimeMin: 0,
          status: 'scheduled',
          createdAt: new Date(),
        },
      ];
      vi.mocked(sittingRepo.findBySchoolId).mockResolvedValue(mockSittings);

      const result = await service.getUpcomingSittings('school-1');

      expect(result).toHaveLength(2);
      expect(sittingRepo.findBySchoolId).toHaveBeenCalledWith('school-1');
    });
  });

  describe('getActiveSittings', () => {
    it('should get active sittings', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago
      const future = new Date(now.getTime() + 55 * 60 * 1000); // 55 minutes from now
      const farFuture = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

      const mockSittings: SittingDomainRecord[] = [
        {
          id: 'sitting-1',
          schoolId: 'school-1',
          examId: 'exam-1',
          classId: 'class-1',
          windowStart: past,
          windowEnd: future,
          extraTimeMin: 0,
          status: 'open',
          createdAt: new Date(),
        },
        {
          id: 'sitting-2',
          schoolId: 'school-1',
          examId: 'exam-1',
          classId: 'class-2',
          windowStart: farFuture,
          windowEnd: new Date(farFuture.getTime() + 60 * 60 * 1000),
          extraTimeMin: 0,
          status: 'open',
          createdAt: new Date(),
        },
      ];
      vi.mocked(sittingRepo.findBySchoolId).mockResolvedValue(mockSittings);

      const result = await service.getActiveSittings('school-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sitting-1');
    });
  });

  describe('getPastSittings', () => {
    it('should get past sittings', async () => {
      const mockSittings: SittingDomainRecord[] = [
        {
          id: 'sitting-1',
          schoolId: 'school-1',
          examId: 'exam-1',
          classId: 'class-1',
          windowStart: new Date('2020-01-01T09:00:00Z'),
          windowEnd: new Date('2020-01-01T11:00:00Z'),
          extraTimeMin: 0,
          status: 'closed',
          createdAt: new Date(),
        },
        {
          id: 'sitting-2',
          schoolId: 'school-1',
          examId: 'exam-1',
          classId: 'class-2',
          windowStart: new Date('2020-01-01T09:00:00:00Z'),
          windowEnd: new Date('2020-01-01T11:00:00Z'),
          extraTimeMin: 0,
          status: 'cancelled',
          createdAt: new Date(),
        },
      ];
      vi.mocked(sittingRepo.findBySchoolId).mockResolvedValue(mockSittings);

      const result = await service.getPastSittings('school-1');

      expect(result).toHaveLength(2);
      expect(sittingRepo.findBySchoolId).toHaveBeenCalledWith('school-1');
    });
  });
});
