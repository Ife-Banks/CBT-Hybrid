import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import type {
  SubjectRepository,
  LevelRepository,
  QuestionRepository,
  AssetRepository,
  QuestionAssetRepository,
  ImportJobRepository,
} from './repositories';
import type {
  CreateSubjectDto,
  UpdateSubjectDto,
  CreateLevelDto,
  UpdateLevelDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  QuestionSearchParams,
  SubjectDomainRecord,
  LevelDomainRecord,
  QuestionDomainRecord,
  AssetDomainRecord,
  CreateAssetDto,
  QuestionAssetDomainRecord,
  CreateQuestionAssetDto,
  ImportJobDomainRecord,
  CreateImportJobDto,
  UpdateImportJobDto,
  BulkCreateQuestionsDto,
  BulkUpdateQuestionsDto,
  BulkApproveQuestionsDto,
  BulkRetireQuestionsDto,
  BulkTagQuestionsDto,
} from './domain/types';
import { AuditService } from '../auth/audit/audit.service';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly subjectRepo?: SubjectRepository,
    private readonly levelRepo?: LevelRepository,
    private readonly questionRepo?: QuestionRepository,
    private readonly assetRepo?: AssetRepository,
    private readonly questionAssetRepo?: QuestionAssetRepository,
    private readonly importJobRepo?: ImportJobRepository,
    private readonly auditService?: AuditService,
  ) {}

  // Subject Management
  async createSubject(dto: CreateSubjectDto, schoolId: string): Promise<SubjectDomainRecord> {
    return await this.subjectRepo!.create(dto, schoolId);
  }

  async getSubject(id: string): Promise<SubjectDomainRecord> {
    const subject = await this.subjectRepo!.findById(id);
    if (!subject) {
      throw new NotFoundException(`Subject with ID ${id} not found`);
    }
    return subject;
  }

  async listSubjects(schoolId: string): Promise<SubjectDomainRecord[]> {
    return await this.subjectRepo!.findBySchoolId(schoolId);
  }

  async updateSubject(id: string, dto: UpdateSubjectDto): Promise<SubjectDomainRecord> {
    return await this.subjectRepo!.update(id, dto);
  }

  async deleteSubject(id: string): Promise<void> {
    await this.subjectRepo!.delete(id);
  }

  // Level Management
  async createLevel(dto: CreateLevelDto, schoolId: string): Promise<LevelDomainRecord> {
    return await this.levelRepo!.create(dto, schoolId);
  }

  async getLevel(id: string): Promise<LevelDomainRecord> {
    const level = await this.levelRepo!.findById(id);
    if (!level) {
      throw new NotFoundException(`Level with ID ${id} not found`);
    }
    return level;
  }

  async listLevels(schoolId: string): Promise<LevelDomainRecord[]> {
    return await this.levelRepo!.findBySchoolId(schoolId);
  }

  async updateLevel(id: string, dto: UpdateLevelDto): Promise<LevelDomainRecord> {
    return await this.levelRepo!.update(id, dto);
  }

  async deleteLevel(id: string): Promise<void> {
    await this.levelRepo!.delete(id);
  }

  // Question Management
  async createQuestion(dto: CreateQuestionDto, schoolId: string, createdBy: string): Promise<QuestionDomainRecord> {
    // Validate question type-specific requirements
    this.validateQuestionData(dto);
    return await this.questionRepo!.create(dto, schoolId, createdBy);
  }

  private validateQuestionData(dto: CreateQuestionDto): void {
    // Matching questions require matchingPairs
    if (dto.type === 'matching' && (!dto.matchingPairs || dto.matchingPairs.length === 0)) {
      throw new ConflictException('Matching questions require matching_pairs data');
    }

    // Ordering questions require correctOrder
    if (dto.type === 'ordering' && (!dto.correctOrder || dto.correctOrder.length === 0)) {
      throw new ConflictException('Ordering questions require correct_order data');
    }

    // Fill-blank questions require fillAnswers
    if (dto.type === 'fill_blank' && (!dto.fillAnswers || Object.keys(dto.fillAnswers).length === 0)) {
      throw new ConflictException('Fill-blank questions require fill_answers data');
    }

    // Choice questions should have options (this will be validated when options are created separately)
    if (['single_choice', 'multi_choice', 'true_false'].includes(dto.type)) {
      // Options are managed separately via question_options table
    }
  }

  async getQuestion(id: string): Promise<QuestionDomainRecord> {
    const question = await this.questionRepo!.findById(id);
    if (!question) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }
    return question;
  }

  async searchQuestions(params: QuestionSearchParams): Promise<{ questions: QuestionDomainRecord[]; total: number }> {
    return await this.questionRepo!.search(params);
  }

  async updateQuestion(id: string, dto: UpdateQuestionDto): Promise<QuestionDomainRecord> {
    return await this.questionRepo!.update(id, dto);
  }

  async deleteQuestion(id: string): Promise<void> {
    await this.questionRepo!.delete(id);
  }

  // Approval Workflow
  async approveQuestion(id: string, approvedBy: string): Promise<QuestionDomainRecord> {
    return await this.questionRepo!.approve(id, approvedBy);
  }

  async retireQuestion(id: string): Promise<QuestionDomainRecord> {
    return await this.questionRepo!.retire(id);
  }

  // Version Control - create new version by copying existing question
  async createQuestionVersion(id: string, createdBy: string): Promise<QuestionDomainRecord> {
    const existing = await this.getQuestion(id);

    if (existing.status !== 'approved') {
      throw new ConflictException('Only approved questions can have new versions');
    }

    // Create new version with supersedes_id pointing to the original
    const newDto: CreateQuestionDto = {
      subjectId: existing.subjectId,
      levelId: existing.levelId ?? undefined,
      type: existing.type,
      stem: existing.stem,
      explanation: existing.explanation,
      marks: existing.marks,
      difficulty: existing.difficulty ?? undefined,
      topic: existing.topic ?? undefined,
      tags: existing.tags,
      fillAnswers: existing.fillAnswers ?? undefined,
      matchingPairs: existing.matchingPairs ?? undefined,
      correctOrder: existing.correctOrder ?? undefined,
    };

    const newQuestion = await this.questionRepo!.create(newDto, existing.schoolId, createdBy);

    // Update original to be superseded (in a real implementation, this would need a direct DB update)
    // For now, we'll create a separate method to handle this properly
    return newQuestion;
  }

  // Usage tracking
  async incrementQuestionUsage(id: string): Promise<void> {
    await this.questionRepo!.incrementUsage(id);
  }

  // Phase 5B: Asset Management
  async createAsset(dto: CreateAssetDto, schoolId: string, uploadedBy: string): Promise<AssetDomainRecord> {
    return await this.assetRepo!.create(dto, schoolId, uploadedBy);
  }

  async getAsset(id: string): Promise<AssetDomainRecord> {
    const asset = await this.assetRepo!.findById(id);
    if (!asset) {
      throw new NotFoundException(`Asset with ID ${id} not found`);
    }
    return asset;
  }

  async listAssets(schoolId: string): Promise<AssetDomainRecord[]> {
    return await this.assetRepo!.findBySchoolId(schoolId);
  }

  async deleteAsset(id: string): Promise<void> {
    await this.assetRepo!.delete(id);
  }

  // Phase 5B: Question Asset Linking
  async attachAssetToQuestion(dto: CreateQuestionAssetDto): Promise<QuestionAssetDomainRecord> {
    return await this.questionAssetRepo!.create(dto);
  }

  async getQuestionAssets(questionId: string): Promise<QuestionAssetDomainRecord[]> {
    return await this.questionAssetRepo!.findByQuestionId(questionId);
  }

  async detachAssetFromQuestion(questionId: string, assetId: string): Promise<void> {
    await this.questionAssetRepo!.delete(questionId, assetId);
  }

  async detachAllAssetsFromQuestion(questionId: string): Promise<void> {
    await this.questionAssetRepo!.deleteByQuestionId(questionId);
  }

  // Phase 5B: Import Job Management
  async createImportJob(dto: CreateImportJobDto, schoolId: string, uploadedBy: string): Promise<ImportJobDomainRecord> {
    return await this.importJobRepo!.create(dto, schoolId, uploadedBy);
  }

  async getImportJob(id: string): Promise<ImportJobDomainRecord> {
    const job = await this.importJobRepo!.findById(id);
    if (!job) {
      throw new NotFoundException(`Import job with ID ${id} not found`);
    }
    return job;
  }

  async listImportJobs(schoolId: string): Promise<ImportJobDomainRecord[]> {
    return await this.importJobRepo!.findBySchoolId(schoolId);
  }

  async updateImportJob(id: string, dto: UpdateImportJobDto): Promise<ImportJobDomainRecord> {
    return await this.importJobRepo!.update(id, dto);
  }

  async deleteImportJob(id: string): Promise<void> {
    await this.importJobRepo!.delete(id);
  }

  // Phase 5B: Bulk Operations
  async bulkCreateQuestions(dto: BulkCreateQuestionsDto, schoolId: string, createdBy: string): Promise<QuestionDomainRecord[]> {
    const results: QuestionDomainRecord[] = [];
    for (const questionDto of dto.questions) {
      try {
        this.validateQuestionData(questionDto);
        const question = await this.questionRepo!.create(questionDto, schoolId, createdBy);
        results.push(question);
      } catch (error) {
        // Continue processing other questions even if one fails
        // In production, we might want to collect errors and return them
        console.error(`Failed to create question: ${error}`);
      }
    }
    return results;
  }

  async bulkUpdateQuestions(dto: BulkUpdateQuestionsDto): Promise<QuestionDomainRecord[]> {
    const results: QuestionDomainRecord[] = [];
    for (const questionId of dto.questionIds) {
      try {
        const question = await this.questionRepo!.update(questionId, dto.updates);
        results.push(question);
      } catch (error) {
        console.error(`Failed to update question ${questionId}: ${error}`);
      }
    }
    return results;
  }

  async bulkApproveQuestions(dto: BulkApproveQuestionsDto): Promise<QuestionDomainRecord[]> {
    const results: QuestionDomainRecord[] = [];
    for (const questionId of dto.questionIds) {
      try {
        const question = await this.approveQuestion(questionId, dto.approvedBy);
        results.push(question);
      } catch (error) {
        console.error(`Failed to approve question ${questionId}: ${error}`);
      }
    }
    return results;
  }

  async bulkRetireQuestions(dto: BulkRetireQuestionsDto): Promise<QuestionDomainRecord[]> {
    const results: QuestionDomainRecord[] = [];
    for (const questionId of dto.questionIds) {
      try {
        const question = await this.retireQuestion(questionId);
        results.push(question);
      } catch (error) {
        console.error(`Failed to retire question ${questionId}: ${error}`);
      }
    }
    return results;
  }

  async bulkTagQuestions(dto: BulkTagQuestionsDto): Promise<QuestionDomainRecord[]> {
    const results: QuestionDomainRecord[] = [];
    for (const questionId of dto.questionIds) {
      try {
        const existing = await this.getQuestion(questionId);
        let updatedTags: string[];

        if (dto.operation === 'add') {
          updatedTags = [...new Set([...existing.tags, ...dto.tags])];
        } else if (dto.operation === 'remove') {
          updatedTags = existing.tags.filter(tag => !dto.tags.includes(tag));
        } else {
          updatedTags = dto.tags;
        }

        const question = await this.questionRepo!.update(questionId, { tags: updatedTags });
        results.push(question);
      } catch (error) {
        console.error(`Failed to update tags for question ${questionId}: ${error}`);
      }
    }
    return results;
  }
}
