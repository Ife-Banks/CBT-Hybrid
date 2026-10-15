import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import type {
  SubjectRepository,
  LevelRepository,
  QuestionRepository,
  AssetRepository,
  QuestionAssetRepository,
  ImportJobRepository,
} from './repositories';
import type {
  SubjectDomainRecord,
  LevelDomainRecord,
  QuestionDomainRecord,
  AssetDomainRecord,
  CreateAssetDto,
  QuestionAssetDomainRecord,
  ImportJobDomainRecord,
  CreateImportJobDto,
  BulkCreateQuestionsDto,
  BulkApproveQuestionsDto,
  BulkTagQuestionsDto,
} from './domain/types';

describe('QuestionsService', () => {
  let service: QuestionsService;
  let subjectRepo: SubjectRepository;
  let levelRepo: LevelRepository;
  let questionRepo: QuestionRepository;
  let assetRepo: AssetRepository;
  let questionAssetRepo: QuestionAssetRepository;
  let importJobRepo: ImportJobRepository;

  const mockSubject: SubjectDomainRecord = {
    id: 'subject-1',
    schoolId: 'school-1',
    name: 'Mathematics',
    code: 'MATH',
    section: 'secondary',
    createdAt: new Date(),
  };

  const mockLevel: LevelDomainRecord = {
    id: 'level-1',
    schoolId: 'school-1',
    name: 'Grade 10',
    section: 'secondary',
    sortOrder: 10,
    createdAt: new Date(),
  };

  const mockQuestion: QuestionDomainRecord = {
    id: 'question-1',
    schoolId: 'school-1',
    subjectId: 'subject-1',
    levelId: 'level-1',
    type: 'single_choice',
    stem: 'What is 2 + 2?',
    explanation: 'Basic addition',
    marks: 1,
    difficulty: 'easy',
    topic: 'Arithmetic',
    tags: ['basic', 'addition'],
    fillAnswers: undefined,
    matchingPairs: undefined,
    correctOrder: undefined,
    status: 'draft',
    version: 1,
    usageCount: 0,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    importRowId: undefined,
  };

  beforeEach(() => {
    subjectRepo = {
      findById: vi.fn(),
      findBySchoolId: vi.fn(),
      findByName: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as SubjectRepository;

    levelRepo = {
      findById: vi.fn(),
      findBySchoolId: vi.fn(),
      findByName: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as LevelRepository;

    questionRepo = {
      findById: vi.fn(),
      findBySchoolId: vi.fn(),
      search: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      approve: vi.fn(),
      retire: vi.fn(),
      incrementUsage: vi.fn(),
    } as unknown as QuestionRepository;

    assetRepo = {
      findById: vi.fn(),
      findBySchoolId: vi.fn(),
      create: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as AssetRepository;

    questionAssetRepo = {
      findByQuestionId: vi.fn(),
      findByAssetId: vi.fn(),
      create: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteByQuestionId: vi.fn().mockResolvedValue(undefined),
    } as unknown as QuestionAssetRepository;

    importJobRepo = {
      findById: vi.fn(),
      findBySchoolId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as ImportJobRepository;

    service = new QuestionsService(
      subjectRepo,
      levelRepo,
      questionRepo,
      assetRepo,
      questionAssetRepo,
      importJobRepo,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Subject Management', () => {
    it('should create a subject', async () => {
      vi.mocked(subjectRepo.findByName).mockResolvedValue(null);
      vi.mocked(subjectRepo.create).mockResolvedValue(mockSubject);

      const result = await service.createSubject(
        { name: 'Mathematics', code: 'MATH', section: 'secondary' },
        'school-1',
      );

      expect(result).toEqual(mockSubject);
      expect(subjectRepo.create).toHaveBeenCalledWith(
        { name: 'Mathematics', code: 'MATH', section: 'secondary' },
        'school-1',
      );
    });

    it('should throw ConflictException when creating duplicate subject', async () => {
      vi.mocked(subjectRepo.findByName).mockResolvedValue(mockSubject);
      vi.mocked(subjectRepo.create).mockRejectedValue(new ConflictException('Subject with name "Mathematics" already exists'));

      await expect(
        service.createSubject({ name: 'Mathematics' }, 'school-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should get a subject by id', async () => {
      vi.mocked(subjectRepo.findById).mockResolvedValue(mockSubject);

      const result = await service.getSubject('subject-1');

      expect(result).toEqual(mockSubject);
      expect(subjectRepo.findById).toHaveBeenCalledWith('subject-1');
    });

    it('should throw NotFoundException when subject not found', async () => {
      vi.mocked(subjectRepo.findById).mockResolvedValue(null);

      await expect(service.getSubject('subject-1')).rejects.toThrow(NotFoundException);
    });

    it('should list subjects by school', async () => {
      vi.mocked(subjectRepo.findBySchoolId).mockResolvedValue([mockSubject]);

      const result = await service.listSubjects('school-1');

      expect(result).toEqual([mockSubject]);
      expect(subjectRepo.findBySchoolId).toHaveBeenCalledWith('school-1');
    });

    it('should update a subject', async () => {
      const updated = { ...mockSubject, name: 'Advanced Math' };
      vi.mocked(subjectRepo.update).mockResolvedValue(updated);

      const result = await service.updateSubject('subject-1', { name: 'Advanced Math' });

      expect(result).toEqual(updated);
      expect(subjectRepo.update).toHaveBeenCalledWith('subject-1', { name: 'Advanced Math' });
    });

    it('should delete a subject', async () => {
      const deleteMock = vi.fn().mockResolvedValue(undefined);
      vi.mocked(subjectRepo.findById).mockResolvedValue(mockSubject);
      (subjectRepo.delete as any) = deleteMock;

      await service.deleteSubject('subject-1');

      expect(deleteMock).toHaveBeenCalledWith('subject-1');
    });
  });

  describe('Level Management', () => {
    it('should create a level', async () => {
      vi.mocked(levelRepo.findByName).mockResolvedValue(null);
      vi.mocked(levelRepo.create).mockResolvedValue(mockLevel);

      const result = await service.createLevel(
        { name: 'Grade 10', section: 'secondary', sortOrder: 10 },
        'school-1',
      );

      expect(result).toEqual(mockLevel);
      expect(levelRepo.create).toHaveBeenCalledWith(
        { name: 'Grade 10', section: 'secondary', sortOrder: 10 },
        'school-1',
      );
    });

    it('should throw ConflictException when creating duplicate level', async () => {
      vi.mocked(levelRepo.findByName).mockResolvedValue(mockLevel);
      vi.mocked(levelRepo.create).mockRejectedValue(new ConflictException('Level with name "Grade 10" already exists'));

      await expect(
        service.createLevel({ name: 'Grade 10', sortOrder: 10 }, 'school-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should get a level by id', async () => {
      vi.mocked(levelRepo.findById).mockResolvedValue(mockLevel);

      const result = await service.getLevel('level-1');

      expect(result).toEqual(mockLevel);
      expect(levelRepo.findById).toHaveBeenCalledWith('level-1');
    });

    it('should throw NotFoundException when level not found', async () => {
      vi.mocked(levelRepo.findById).mockResolvedValue(null);

      await expect(service.getLevel('level-1')).rejects.toThrow(NotFoundException);
    });

    it('should list levels by school', async () => {
      vi.mocked(levelRepo.findBySchoolId).mockResolvedValue([mockLevel]);

      const result = await service.listLevels('school-1');

      expect(result).toEqual([mockLevel]);
      expect(levelRepo.findBySchoolId).toHaveBeenCalledWith('school-1');
    });

    it('should update a level', async () => {
      const updated = { ...mockLevel, name: 'Grade 11' };
      vi.mocked(levelRepo.update).mockResolvedValue(updated);

      const result = await service.updateLevel('level-1', { name: 'Grade 11' });

      expect(result).toEqual(updated);
      expect(levelRepo.update).toHaveBeenCalledWith('level-1', { name: 'Grade 11' });
    });

    it('should delete a level', async () => {
      const deleteMock = vi.fn().mockResolvedValue(undefined);
      vi.mocked(levelRepo.findById).mockResolvedValue(mockLevel);
      (levelRepo.delete as any) = deleteMock;

      await service.deleteLevel('level-1');

      expect(deleteMock).toHaveBeenCalledWith('level-1');
    });
  });

  describe('Question Management', () => {
    it('should create a question', async () => {
      vi.mocked(questionRepo.create).mockResolvedValue(mockQuestion);

      const result = await service.createQuestion(
        {
          subjectId: 'subject-1',
          levelId: 'level-1',
          type: 'single_choice',
          stem: 'What is 2 + 2?',
          marks: 1,
          difficulty: 'easy',
          topic: 'Arithmetic',
          tags: ['basic', 'addition'],
        },
        'school-1',
        'user-1',
      );

      expect(result).toEqual(mockQuestion);
      expect(questionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectId: 'subject-1',
          type: 'single_choice',
          stem: 'What is 2 + 2?',
        }),
        'school-1',
        'user-1',
      );
    });

    it('should get a question by id', async () => {
      vi.mocked(questionRepo.findById).mockResolvedValue(mockQuestion);

      const result = await service.getQuestion('question-1');

      expect(result).toEqual(mockQuestion);
      expect(questionRepo.findById).toHaveBeenCalledWith('question-1');
    });

    it('should throw NotFoundException when question not found', async () => {
      vi.mocked(questionRepo.findById).mockResolvedValue(null);

      await expect(service.getQuestion('question-1')).rejects.toThrow(NotFoundException);
    });

    it('should search questions', async () => {
      vi.mocked(questionRepo.search).mockResolvedValue({
        questions: [mockQuestion],
        total: 1,
      });

      const result = await service.searchQuestions({
        schoolId: 'school-1',
        filter: { type: 'single_choice' },
        page: 1,
        limit: 20,
      });

      expect(result).toEqual({ questions: [mockQuestion], total: 1 });
      expect(questionRepo.search).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: 'school-1',
          filter: { type: 'single_choice' },
        }),
      );
    });

    it('should update a question', async () => {
      const updated = { ...mockQuestion, stem: 'What is 3 + 3?' };
      vi.mocked(questionRepo.update).mockResolvedValue(updated);

      const result = await service.updateQuestion('question-1', { stem: 'What is 3 + 3?' });

      expect(result).toEqual(updated);
      expect(questionRepo.update).toHaveBeenCalledWith('question-1', { stem: 'What is 3 + 3?' });
    });

    it('should delete a question', async () => {
      const deleteMock = vi.fn().mockResolvedValue(undefined);
      (questionRepo.delete as any) = deleteMock;

      await service.deleteQuestion('question-1');

      expect(deleteMock).toHaveBeenCalledWith('question-1');
    });
  });

  describe('Approval Workflow', () => {
    it('should approve a question', async () => {
      const approved = { ...mockQuestion, status: 'approved' as const, approvedBy: 'user-2', approvedAt: new Date() };
      vi.mocked(questionRepo.approve).mockResolvedValue(approved);

      const result = await service.approveQuestion('question-1', 'user-2');

      expect(result).toEqual(approved);
      expect(questionRepo.approve).toHaveBeenCalledWith('question-1', 'user-2');
    });

    it('should retire a question', async () => {
      const retired = { ...mockQuestion, status: 'retired' as const };
      vi.mocked(questionRepo.retire).mockResolvedValue(retired);

      const result = await service.retireQuestion('question-1');

      expect(result).toEqual(retired);
      expect(questionRepo.retire).toHaveBeenCalledWith('question-1');
    });
  });

  describe('Version Control', () => {
    it('should create a new version of an approved question', async () => {
      const approved = { ...mockQuestion, status: 'approved' as const };
      const newVersion = { ...mockQuestion, id: 'question-2', version: 2, status: 'draft' as const };

      vi.mocked(questionRepo.findById).mockResolvedValue(approved);
      vi.mocked(questionRepo.create).mockResolvedValue(newVersion);

      const result = await service.createQuestionVersion('question-1', 'user-2');

      expect(result).toEqual(newVersion);
      expect(questionRepo.create).toHaveBeenCalled();
    });

    it('should throw ConflictException when versioning non-approved question', async () => {
      vi.mocked(questionRepo.findById).mockResolvedValue(mockQuestion); // draft status

      await expect(service.createQuestionVersion('question-1', 'user-2')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('Usage Tracking', () => {
    it('should increment question usage', async () => {
      const incrementMock = vi.fn().mockResolvedValue(undefined);
      (questionRepo.incrementUsage as any) = incrementMock;

      await service.incrementQuestionUsage('question-1');

      expect(incrementMock).toHaveBeenCalledWith('question-1');
    });
  });

  // Phase 5B: Asset Management Tests
  describe('Asset Management', () => {
    const mockAsset: AssetDomainRecord = {
      id: 'asset-1',
      schoolId: 'school-1',
      type: 'image',
      filename: 'test.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      storagePath: '/uploads/test.png',
      storageProvider: 'local',
      uploadedBy: 'user-1',
      createdAt: new Date(),
    };

    it('should create an asset', async () => {
      const dto: CreateAssetDto = {
        type: 'image',
        filename: 'test.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        storagePath: '/uploads/test.png',
      };

      vi.mocked(assetRepo.create).mockResolvedValue(mockAsset);

      const result = await service.createAsset(dto, 'school-1', 'user-1');

      expect(result).toEqual(mockAsset);
      expect(assetRepo.create).toHaveBeenCalledWith(dto, 'school-1', 'user-1');
    });

    it('should get an asset by ID', async () => {
      vi.mocked(assetRepo.findById).mockResolvedValue(mockAsset);

      const result = await service.getAsset('asset-1');

      expect(result).toEqual(mockAsset);
      expect(assetRepo.findById).toHaveBeenCalledWith('asset-1');
    });

    it('should throw NotFoundException when asset not found', async () => {
      vi.mocked(assetRepo.findById).mockResolvedValue(null);

      await expect(service.getAsset('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should list assets by school', async () => {
      vi.mocked(assetRepo.findBySchoolId).mockResolvedValue([mockAsset]);

      const result = await service.listAssets('school-1');

      expect(result).toEqual([mockAsset]);
      expect(assetRepo.findBySchoolId).toHaveBeenCalledWith('school-1');
    });

    it('should delete an asset', async () => {
      vi.mocked(assetRepo.findById).mockResolvedValue(mockAsset);

      await service.deleteAsset('asset-1');

      expect(assetRepo.delete).toHaveBeenCalledWith('asset-1');
    });
  });

  // Phase 5B: Question Asset Linking Tests
  describe('Question Asset Linking', () => {
    const mockQuestionAsset: QuestionAssetDomainRecord = {
      questionId: 'question-1',
      assetId: 'asset-1',
      assetRole: 'illustration',
      createdAt: new Date(),
    };

    it('should attach asset to question', async () => {
      vi.mocked(questionAssetRepo.create).mockResolvedValue(mockQuestionAsset);

      const result = await service.attachAssetToQuestion({
        questionId: 'question-1',
        assetId: 'asset-1',
      });

      expect(result).toEqual(mockQuestionAsset);
      expect(questionAssetRepo.create).toHaveBeenCalled();
      const callArgs = vi.mocked(questionAssetRepo.create).mock.calls[0][0];
      expect(callArgs.questionId).toBe('question-1');
      expect(callArgs.assetId).toBe('asset-1');
      // assetRole is handled by the repository with a default value
    });

    it('should get question assets', async () => {
      vi.mocked(questionAssetRepo.findByQuestionId).mockResolvedValue([mockQuestionAsset]);

      const result = await service.getQuestionAssets('question-1');

      expect(result).toEqual([mockQuestionAsset]);
      expect(questionAssetRepo.findByQuestionId).toHaveBeenCalledWith('question-1');
    });

    it('should detach asset from question', async () => {
      await service.detachAssetFromQuestion('question-1', 'asset-1');

      expect(questionAssetRepo.delete).toHaveBeenCalledWith('question-1', 'asset-1');
    });

    it('should detach all assets from question', async () => {
      await service.detachAllAssetsFromQuestion('question-1');

      expect(questionAssetRepo.deleteByQuestionId).toHaveBeenCalledWith('question-1');
    });
  });

  // Phase 5B: Import Job Management Tests
  describe('Import Job Management', () => {
    const mockImportJob: ImportJobDomainRecord = {
      id: 'job-1',
      schoolId: 'school-1',
      kind: 'word',
      status: 'pending',
      fileAssetId: 'asset-1',
      uploadedBy: 'user-1',
      totalRows: 0,
      processedRows: 0,
      succeededRows: 0,
      failedRows: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create an import job', async () => {
      const dto: CreateImportJobDto = {
        kind: 'word',
        fileAssetId: 'asset-1',
      };

      vi.mocked(importJobRepo.create).mockResolvedValue(mockImportJob);

      const result = await service.createImportJob(dto, 'school-1', 'user-1');

      expect(result).toEqual(mockImportJob);
      expect(importJobRepo.create).toHaveBeenCalledWith(dto, 'school-1', 'user-1');
    });

    it('should get an import job by ID', async () => {
      vi.mocked(importJobRepo.findById).mockResolvedValue(mockImportJob);

      const result = await service.getImportJob('job-1');

      expect(result).toEqual(mockImportJob);
      expect(importJobRepo.findById).toHaveBeenCalledWith('job-1');
    });

    it('should throw NotFoundException when import job not found', async () => {
      vi.mocked(importJobRepo.findById).mockResolvedValue(null);

      await expect(service.getImportJob('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should list import jobs by school', async () => {
      vi.mocked(importJobRepo.findBySchoolId).mockResolvedValue([mockImportJob]);

      const result = await service.listImportJobs('school-1');

      expect(result).toEqual([mockImportJob]);
      expect(importJobRepo.findBySchoolId).toHaveBeenCalledWith('school-1');
    });

    it('should update an import job', async () => {
      const updated = { ...mockImportJob, status: 'completed' as const };
      vi.mocked(importJobRepo.findById).mockResolvedValue(mockImportJob);
      vi.mocked(importJobRepo.update).mockResolvedValue(updated);

      const result = await service.updateImportJob('job-1', { status: 'completed' });

      expect(result).toEqual(updated);
      expect(importJobRepo.update).toHaveBeenCalledWith('job-1', { status: 'completed' });
    });

    it('should delete an import job', async () => {
      vi.mocked(importJobRepo.findById).mockResolvedValue(mockImportJob);

      await service.deleteImportJob('job-1');

      expect(importJobRepo.delete).toHaveBeenCalledWith('job-1');
    });
  });

  // Phase 5B: Bulk Operations Tests
  describe('Bulk Operations', () => {
    it('should bulk create questions', async () => {
      const dto: BulkCreateQuestionsDto = {
        questions: [
          {
            subjectId: 'subject-1',
            type: 'single_choice',
            stem: 'Question 1',
            marks: 1,
          },
          {
            subjectId: 'subject-1',
            type: 'single_choice',
            stem: 'Question 2',
            marks: 1,
          },
        ],
      };

      vi.mocked(questionRepo.create).mockResolvedValue(mockQuestion);

      const result = await service.bulkCreateQuestions(dto, 'school-1', 'user-1');

      expect(result).toHaveLength(2);
      expect(questionRepo.create).toHaveBeenCalledTimes(2);
    });

    it('should bulk update questions', async () => {
      const dto: BulkUpdateQuestionsDto = {
        questionIds: ['question-1', 'question-2'],
        updates: { topic: 'New Topic' },
      };

      vi.mocked(questionRepo.update).mockResolvedValue(mockQuestion);

      const result = await service.bulkUpdateQuestions(dto);

      expect(result).toHaveLength(2);
      expect(questionRepo.update).toHaveBeenCalledTimes(2);
    });

    it('should bulk approve questions', async () => {
      const dto: BulkApproveQuestionsDto = {
        questionIds: ['question-1', 'question-2'],
        approvedBy: 'user-1',
      };

      const approved = { ...mockQuestion, status: 'approved' as const };
      vi.mocked(questionRepo.findById).mockResolvedValue(mockQuestion);
      vi.mocked(questionRepo.approve).mockResolvedValue(approved);

      const result = await service.bulkApproveQuestions(dto);

      expect(result).toHaveLength(2);
      expect(questionRepo.approve).toHaveBeenCalledTimes(2);
    });

    it('should bulk retire questions', async () => {
      const dto: BulkRetireQuestionsDto = {
        questionIds: ['question-1', 'question-2'],
      };

      const retired = { ...mockQuestion, status: 'retired' as const };
      vi.mocked(questionRepo.findById).mockResolvedValue(mockQuestion);
      vi.mocked(questionRepo.retire).mockResolvedValue(retired);

      const result = await service.bulkRetireQuestions(dto);

      expect(result).toHaveLength(2);
      expect(questionRepo.retire).toHaveBeenCalledTimes(2);
    });

    it('should bulk add tags to questions', async () => {
      const dto: BulkTagQuestionsDto = {
        questionIds: ['question-1', 'question-2'],
        tags: ['tag1', 'tag2'],
        operation: 'add',
      };

      vi.mocked(questionRepo.findById).mockResolvedValue(mockQuestion);
      vi.mocked(questionRepo.update).mockResolvedValue(mockQuestion);

      const result = await service.bulkTagQuestions(dto);

      expect(result).toHaveLength(2);
      expect(questionRepo.update).toHaveBeenCalledTimes(2);
    });

    it('should bulk remove tags from questions', async () => {
      const dto: BulkTagQuestionsDto = {
        questionIds: ['question-1'],
        tags: ['tag1'],
        operation: 'remove',
      };

      const withTags = { ...mockQuestion, tags: ['tag1', 'tag2'] };
      vi.mocked(questionRepo.findById).mockResolvedValue(withTags);
      vi.mocked(questionRepo.update).mockResolvedValue(mockQuestion);

      const result = await service.bulkTagQuestions(dto);

      expect(result).toHaveLength(1);
      expect(questionRepo.update).toHaveBeenCalledWith('question-1', { tags: ['tag2'] });
    });

    it('should bulk replace tags on questions', async () => {
      const dto: BulkTagQuestionsDto = {
        questionIds: ['question-1'],
        tags: ['newtag'],
        operation: 'replace',
      };

      vi.mocked(questionRepo.findById).mockResolvedValue(mockQuestion);
      vi.mocked(questionRepo.update).mockResolvedValue(mockQuestion);

      const result = await service.bulkTagQuestions(dto);

      expect(result).toHaveLength(1);
      expect(questionRepo.update).toHaveBeenCalledWith('question-1', { tags: ['newtag'] });
    });
  });
});
