import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ExamsService } from './exams.service';
import type {
  ClassRepository,
  ExamRepository,
  SittingRepository,
} from './repositories';
import type {
  ClassDomainRecord,
  ExamDomainRecord,
  SittingDomainRecord,
  CreateClassDto,
  CreateExamDto,
  UpdateExamDto,
  CreateSittingDto,
  UpdateSittingDto,
} from './domain/types';

describe('ExamsService', () => {
  let service: ExamsService;
  let classRepo: ClassRepository;
  let examRepo: ExamRepository;
  let sittingRepo: SittingRepository;
  let auditService: any;

  beforeEach(() => {
    classRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findBySchoolId: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as ClassRepository;

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

    sittingRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findBySchoolId: vi.fn(),
      findByExamId: vi.fn(),
      findByClassId: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as SittingRepository;

    auditService = {
      record: vi.fn(),
      list: vi.fn(),
    };

    service = new ExamsService(classRepo, examRepo, sittingRepo, auditService);
  });

  describe('Class management', () => {
    it('should create a class', async () => {
      const dto: CreateClassDto = { name: 'Class 1A', section: 'primary' };
      const mockClass: ClassDomainRecord = {
        id: 'class-1',
        schoolId: 'school-1',
        name: 'Class 1A',
        section: 'primary',
        createdAt: new Date(),
      };
      vi.mocked(classRepo.create).mockResolvedValue(mockClass);

      const result = await service.createClass(dto, 'school-1', 'user-1');

      expect(result).toEqual(mockClass);
      expect(classRepo.create).toHaveBeenCalledWith(dto, 'school-1');
      expect(auditService.record).toHaveBeenCalled();
    });

    it('should get a class by id', async () => {
      const mockClass: ClassDomainRecord = {
        id: 'class-1',
        schoolId: 'school-1',
        name: 'Class 1A',
        section: 'primary',
        createdAt: new Date(),
      };
      vi.mocked(classRepo.findById).mockResolvedValue(mockClass);

      const result = await service.getClass('class-1');

      expect(result).toEqual(mockClass);
      expect(classRepo.findById).toHaveBeenCalledWith('class-1');
    });

    it('should throw NotFoundException when class not found', async () => {
      vi.mocked(classRepo.findById).mockResolvedValue(null);

      await expect(service.getClass('class-1')).rejects.toThrow(NotFoundException);
    });

    it('should list classes by school', async () => {
      const mockClasses: ClassDomainRecord[] = [
        {
          id: 'class-1',
          schoolId: 'school-1',
          name: 'Class 1A',
          section: 'primary',
          createdAt: new Date(),
        },
      ];
      vi.mocked(classRepo.findBySchoolId).mockResolvedValue(mockClasses);

      const result = await service.listClasses('school-1');

      expect(result).toEqual(mockClasses);
      expect(classRepo.findBySchoolId).toHaveBeenCalledWith('school-1');
    });

    it('should update a class', async () => {
      const mockClass: ClassDomainRecord = {
        id: 'class-1',
        schoolId: 'school-1',
        name: 'Class 1B',
        section: 'primary',
        createdAt: new Date(),
      };
      vi.mocked(classRepo.findById).mockResolvedValue(mockClass);
      vi.mocked(classRepo.update).mockResolvedValue(mockClass);

      const result = await service.updateClass('class-1', { name: 'Class 1B' }, 'school-1', 'user-1');

      expect(result).toEqual(mockClass);
      expect(classRepo.update).toHaveBeenCalledWith('class-1', { name: 'Class 1B' });
    });

    it('should throw ConflictException when updating class from different school', async () => {
      const mockClass: ClassDomainRecord = {
        id: 'class-1',
        schoolId: 'school-2',
        name: 'Class 1A',
        section: 'primary',
        createdAt: new Date(),
      };
      vi.mocked(classRepo.findById).mockResolvedValue(mockClass);

      await expect(service.updateClass('class-1', { name: 'Class 1B' }, 'school-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('should delete a class', async () => {
      const mockClass: ClassDomainRecord = {
        id: 'class-1',
        schoolId: 'school-1',
        name: 'Class 1A',
        section: 'primary',
        createdAt: new Date(),
      };
      vi.mocked(classRepo.findById).mockResolvedValue(mockClass);
      vi.mocked(classRepo.delete).mockResolvedValue(undefined);

      await service.deleteClass('class-1', 'school-1', 'user-1');

      expect(classRepo.delete).toHaveBeenCalledWith('class-1');
      expect(auditService.record).toHaveBeenCalled();
    });
  });

  describe('Exam management', () => {
    it('should create an exam', async () => {
      const dto: CreateExamDto = {
        title: 'Math Test',
        subjectId: 'subject-1',
        durationMin: 60,
      };
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
      vi.mocked(examRepo.create).mockResolvedValue(mockExam);

      const result = await service.createExam(dto, 'school-1', 'user-1');

      expect(result).toEqual(mockExam);
      expect(examRepo.create).toHaveBeenCalledWith(dto, 'school-1', 'user-1');
      expect(auditService.record).toHaveBeenCalled();
    });

    it('should get an exam by id', async () => {
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
      vi.mocked(examRepo.findById).mockResolvedValue(mockExam);

      const result = await service.getExam('exam-1');

      expect(result).toEqual(mockExam);
      expect(examRepo.findById).toHaveBeenCalledWith('exam-1');
    });

    it('should throw NotFoundException when exam not found', async () => {
      vi.mocked(examRepo.findById).mockResolvedValue(null);

      await expect(service.getExam('exam-1')).rejects.toThrow(NotFoundException);
    });

    it('should list exams by school', async () => {
      const mockExams: ExamDomainRecord[] = [
        {
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
        },
      ];
      vi.mocked(examRepo.findBySchoolId).mockResolvedValue(mockExams);

      const result = await service.listExams('school-1');

      expect(result).toEqual(mockExams);
      expect(examRepo.findBySchoolId).toHaveBeenCalledWith('school-1');
    });

    it('should update an exam', async () => {
      const mockExam: ExamDomainRecord = {
        id: 'exam-1',
        schoolId: 'school-1',
        title: 'Math Test 2',
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
      vi.mocked(examRepo.findById).mockResolvedValue(mockExam);
      vi.mocked(examRepo.update).mockResolvedValue(mockExam);

      const result = await service.updateExam('exam-1', { title: 'Math Test 2' }, 'school-1', 'user-1');

      expect(result).toEqual(mockExam);
      expect(examRepo.update).toHaveBeenCalledWith('exam-1', { title: 'Math Test 2' });
    });

    it('should throw ConflictException when updating published exam', async () => {
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
        status: 'published',
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(examRepo.findById).mockResolvedValue(mockExam);

      await expect(service.updateExam('exam-1', { title: 'Math Test 2' }, 'school-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('should delete an exam', async () => {
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
      vi.mocked(examRepo.findById).mockResolvedValue(mockExam);
      vi.mocked(examRepo.delete).mockResolvedValue(undefined);

      await service.deleteExam('exam-1', 'school-1', 'user-1');

      expect(examRepo.delete).toHaveBeenCalledWith('exam-1');
      expect(auditService.record).toHaveBeenCalled();
    });

    it('should throw ConflictException when deleting published exam', async () => {
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
        status: 'published',
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(examRepo.findById).mockResolvedValue(mockExam);

      await expect(service.deleteExam('exam-1', 'school-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('Question management in exams', () => {
    it('should add a question to an exam', async () => {
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
      vi.mocked(examRepo.findById).mockResolvedValue(mockExam);
      vi.mocked(examRepo.addQuestion).mockResolvedValue(undefined);

      await service.addQuestionToExam('exam-1', 'question-1', 1, undefined, 'school-1', 'user-1');

      expect(examRepo.addQuestion).toHaveBeenCalledWith('exam-1', 'question-1', 1, undefined);
      expect(auditService.record).toHaveBeenCalled();
    });

    it('should throw ConflictException when adding question to published exam', async () => {
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
        status: 'published',
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(examRepo.findById).mockResolvedValue(mockExam);

      await expect(service.addQuestionToExam('exam-1', 'question-1', 1, undefined, 'school-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('should remove a question from an exam', async () => {
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
      vi.mocked(examRepo.findById).mockResolvedValue(mockExam);
      vi.mocked(examRepo.removeQuestion).mockResolvedValue(undefined);

      await service.removeQuestionFromExam('exam-1', 'question-1', 'school-1', 'user-1');

      expect(examRepo.removeQuestion).toHaveBeenCalledWith('exam-1', 'question-1');
      expect(auditService.record).toHaveBeenCalled();
    });

    it('should get exam questions', async () => {
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
      const mockQuestions = [
        { questionId: 'question-1', position: 1 },
        { questionId: 'question-2', position: 2 },
      ];
      vi.mocked(examRepo.findById).mockResolvedValue(mockExam);
      vi.mocked(examRepo.getQuestions).mockResolvedValue(mockQuestions);

      const result = await service.getExamQuestions('exam-1', 'school-1');

      expect(result).toEqual(mockQuestions);
      expect(examRepo.getQuestions).toHaveBeenCalledWith('exam-1');
    });
  });

  describe('Sitting management', () => {
    it('should create a sitting', async () => {
      const dto: CreateSittingDto = {
        examId: 'exam-1',
        classId: 'class-1',
        windowStart: new Date('2024-01-01T09:00:00Z'),
        windowEnd: new Date('2024-01-01T11:00:00Z'),
      };
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
      vi.mocked(examRepo.findById).mockResolvedValue(mockExam);
      vi.mocked(sittingRepo.create).mockResolvedValue(mockSitting);

      const result = await service.createSitting(dto, 'school-1', 'user-1');

      expect(result).toEqual(mockSitting);
      expect(sittingRepo.create).toHaveBeenCalledWith(dto, 'school-1');
      expect(auditService.record).toHaveBeenCalled();
    });

    it('should get a sitting by id', async () => {
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

      const result = await service.getSitting('sitting-1');

      expect(result).toEqual(mockSitting);
      expect(sittingRepo.findById).toHaveBeenCalledWith('sitting-1');
    });

    it('should list sittings by school', async () => {
      const mockSittings: SittingDomainRecord[] = [
        {
          id: 'sitting-1',
          schoolId: 'school-1',
          examId: 'exam-1',
          classId: 'class-1',
          windowStart: new Date('2024-01-01T09:00:00Z'),
          windowEnd: new Date('2024-01-01T11:00:00Z'),
          extraTimeMin: 0,
          status: 'scheduled',
          createdAt: new Date(),
        },
      ];
      vi.mocked(sittingRepo.findBySchoolId).mockResolvedValue(mockSittings);

      const result = await service.listSittings('school-1');

      expect(result).toEqual(mockSittings);
      expect(sittingRepo.findBySchoolId).toHaveBeenCalledWith('school-1');
    });

    it('should delete a sitting', async () => {
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
      vi.mocked(sittingRepo.delete).mockResolvedValue(undefined);

      await service.deleteSitting('sitting-1', 'school-1', 'user-1');

      expect(sittingRepo.delete).toHaveBeenCalledWith('sitting-1');
      expect(auditService.record).toHaveBeenCalled();
    });

    it('should throw ConflictException when deleting open sitting', async () => {
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

      await expect(service.deleteSitting('sitting-1', 'school-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });
});
