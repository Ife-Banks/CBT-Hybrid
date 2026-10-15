import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { AuditService } from '../auth/audit/audit.service';
import { QuestionsService } from './questions.service';
import {
  createSubjectSchema,
  updateSubjectSchema,
  createLevelSchema,
  updateLevelSchema,
  createQuestionSchema,
  updateQuestionSchema,
  questionSearchParamsSchema,
  createAssetSchema,
  createQuestionAssetSchema,
  createImportJobSchema,
  updateImportJobSchema,
} from './dto/questions.dto';
import type {
  CreateAssetDto,
  CreateQuestionAssetDto,
  CreateImportJobDto,
  UpdateImportJobDto,
  BulkCreateQuestionsDto,
  BulkUpdateQuestionsDto,
  BulkApproveQuestionsDto,
  BulkRetireQuestionsDto,
  BulkTagQuestionsDto,
} from './domain/types';

@Controller('questions')
@UseGuards(AuthGuard, AbilitiesGuard)
export class QuestionsController {
  constructor(
    private readonly questionsService: QuestionsService,
    private readonly auditService: AuditService,
  ) {}

  // Subject endpoints
  @Post('subjects')
  async createSubject(@Body() body: unknown, @Request() req: any) {
    const dto = createSubjectSchema.parse(body);
    const schoolId = req.user.schoolId;
    const result = await this.questionsService.createSubject(dto, schoolId);
    await this.auditService.record({
      action: 'subject.created',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId,
      targetType: 'subject',
      targetId: result.id,
    });
    return result;
  }

  @Get('subjects/:id')
  async getSubject(@Param('id') id: string) {
    return await this.questionsService.getSubject(id);
  }

  @Get('subjects')
  async listSubjects(@Request() req: any) {
    const schoolId = req.user.schoolId;
    return await this.questionsService.listSubjects(schoolId);
  }

  @Put('subjects/:id')
  async updateSubject(@Param('id') id: string, @Body() body: unknown, @Request() req: any) {
    const dto = updateSubjectSchema.parse(body);
    const result = await this.questionsService.updateSubject(id, dto);
    await this.auditService.record({
      action: 'subject.updated',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'subject',
      targetId: id,
    });
    return result;
  }

  @Delete('subjects/:id')
  async deleteSubject(@Param('id') id: string, @Request() req: any) {
    await this.questionsService.deleteSubject(id);
    await this.auditService.record({
      action: 'subject.deleted',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'subject',
      targetId: id,
    });
  }

  // Level endpoints
  @Post('levels')
  async createLevel(@Body() body: unknown, @Request() req: any) {
    const dto = createLevelSchema.parse(body);
    const schoolId = req.user.schoolId;
    const result = await this.questionsService.createLevel(dto, schoolId);
    await this.auditService.record({
      action: 'level.created',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId,
      targetType: 'level',
      targetId: result.id,
    });
    return result;
  }

  @Get('levels/:id')
  async getLevel(@Param('id') id: string) {
    return await this.questionsService.getLevel(id);
  }

  @Get('levels')
  async listLevels(@Request() req: any) {
    const schoolId = req.user.schoolId;
    return await this.questionsService.listLevels(schoolId);
  }

  @Put('levels/:id')
  async updateLevel(@Param('id') id: string, @Body() body: unknown, @Request() req: any) {
    const dto = updateLevelSchema.parse(body);
    const result = await this.questionsService.updateLevel(id, dto);
    await this.auditService.record({
      action: 'level.updated',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'level',
      targetId: id,
    });
    return result;
  }

  @Delete('levels/:id')
  async deleteLevel(@Param('id') id: string, @Request() req: any) {
    await this.questionsService.deleteLevel(id);
    await this.auditService.record({
      action: 'level.deleted',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'level',
      targetId: id,
    });
  }

  // Question endpoints
  @Post()
  async createQuestion(@Body() body: unknown, @Request() req: any) {
    const dto = createQuestionSchema.parse(body);
    const schoolId = req.user.schoolId;
    const result = await this.questionsService.createQuestion(dto, schoolId, req.user.id);
    await this.auditService.record({
      action: 'question.created',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId,
      targetType: 'question',
      targetId: result.id,
    });
    return result;
  }

  @Get(':id')
  async getQuestion(@Param('id') id: string) {
    return await this.questionsService.getQuestion(id);
  }

  @Get()
  async searchQuestions(@Query() query: unknown, @Request() req: any) {
    const params = questionSearchParamsSchema.parse(query);
    const schoolId = req.user.schoolId;
    return await this.questionsService.searchQuestions({
      schoolId,
      filter: params.filter ?? {},
      page: params.page,
      limit: params.limit,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    });
  }

  @Put(':id')
  async updateQuestion(@Param('id') id: string, @Body() body: unknown, @Request() req: any) {
    const dto = updateQuestionSchema.parse(body);
    const result = await this.questionsService.updateQuestion(id, dto);
    await this.auditService.record({
      action: 'question.updated',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'question',
      targetId: id,
    });
    return result;
  }

  @Delete(':id')
  async deleteQuestion(@Param('id') id: string, @Request() req: any) {
    await this.questionsService.deleteQuestion(id);
    await this.auditService.record({
      action: 'question.deleted',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'question',
      targetId: id,
    });
  }

  // Approval workflow
  @Post(':id/approve')
  async approveQuestion(@Param('id') id: string, @Request() req: any) {
    const result = await this.questionsService.approveQuestion(id, req.user.id);
    await this.auditService.record({
      action: 'question.approved',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'question',
      targetId: id,
    });
    return result;
  }

  @Post(':id/retire')
  async retireQuestion(@Param('id') id: string, @Request() req: any) {
    const result = await this.questionsService.retireQuestion(id);
    await this.auditService.record({
      action: 'question.retired',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'question',
      targetId: id,
    });
    return result;
  }

  // Version control
  @Post(':id/version')
  async createQuestionVersion(@Param('id') id: string, @Request() req: any) {
    const result = await this.questionsService.createQuestionVersion(id, req.user.id);
    await this.auditService.record({
      action: 'question.versioned',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'question',
      targetId: id,
      detail: { newVersionId: result.id },
    });
    return result;
  }

  // Phase 5B: Asset Management
  @Post('assets')
  async createAsset(@Body() body: unknown, @Request() req: any) {
    const dto = createAssetSchema.parse(body) as CreateAssetDto;
    const schoolId = req.user.schoolId;
    const result = await this.questionsService.createAsset(dto, schoolId, req.user.id);
    await this.auditService.record({
      action: 'asset.created',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId,
      targetType: 'asset',
      targetId: result.id,
    });
    return result;
  }

  @Get('assets/:id')
  async getAsset(@Param('id') id: string) {
    return await this.questionsService.getAsset(id);
  }

  @Get('assets')
  async listAssets(@Request() req: any) {
    const schoolId = req.user.schoolId;
    return await this.questionsService.listAssets(schoolId);
  }

  @Delete('assets/:id')
  async deleteAsset(@Param('id') id: string, @Request() req: any) {
    await this.questionsService.deleteAsset(id);
    await this.auditService.record({
      action: 'asset.deleted',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'asset',
      targetId: id,
    });
  }

  // Phase 5B: Question Asset Linking
  @Post('questions/:questionId/assets')
  async attachAssetToQuestion(@Param('questionId') questionId: string, @Body() body: unknown, @Request() req: any) {
    const dto = createQuestionAssetSchema.parse(body) as CreateQuestionAssetDto;
    const result = await this.questionsService.attachAssetToQuestion({ ...dto, questionId });
    await this.auditService.record({
      action: 'question.asset_attached',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'question_asset',
      targetId: questionId,
      detail: { assetId: dto.assetId },
    });
    return result;
  }

  @Get('questions/:questionId/assets')
  async getQuestionAssets(@Param('questionId') questionId: string) {
    return await this.questionsService.getQuestionAssets(questionId);
  }

  @Delete('questions/:questionId/assets/:assetId')
  async detachAssetFromQuestion(@Param('questionId') questionId: string, @Param('assetId') assetId: string, @Request() req: any) {
    await this.questionsService.detachAssetFromQuestion(questionId, assetId);
    await this.auditService.record({
      action: 'question.asset_detached',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'question_asset',
      targetId: questionId,
      detail: { assetId },
    });
  }

  // Phase 5B: Import Job Management
  @Post('import-jobs')
  async createImportJob(@Body() body: unknown, @Request() req: any) {
    const dto = createImportJobSchema.parse(body) as CreateImportJobDto;
    const schoolId = req.user.schoolId;
    const result = await this.questionsService.createImportJob(dto, schoolId, req.user.id);
    await this.auditService.record({
      action: 'import_job.created',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId,
      targetType: 'import_job',
      targetId: result.id,
    });
    return result;
  }

  @Get('import-jobs/:id')
  async getImportJob(@Param('id') id: string) {
    return await this.questionsService.getImportJob(id);
  }

  @Get('import-jobs')
  async listImportJobs(@Request() req: any) {
    const schoolId = req.user.schoolId;
    return await this.questionsService.listImportJobs(schoolId);
  }

  @Put('import-jobs/:id')
  async updateImportJob(@Param('id') id: string, @Body() body: unknown, @Request() req: any) {
    const dto = updateImportJobSchema.parse(body) as UpdateImportJobDto;
    const result = await this.questionsService.updateImportJob(id, dto);
    await this.auditService.record({
      action: 'import_job.updated',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'import_job',
      targetId: id,
    });
    return result;
  }

  @Delete('import-jobs/:id')
  async deleteImportJob(@Param('id') id: string, @Request() req: any) {
    await this.questionsService.deleteImportJob(id);
    await this.auditService.record({
      action: 'import_job.deleted',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'import_job',
      targetId: id,
    });
  }

  // Phase 5B: Bulk Operations
  @Post('bulk/create')
  async bulkCreateQuestions(@Body() body: unknown, @Request() req: any) {
    const dto = body as BulkCreateQuestionsDto;
    const schoolId = req.user.schoolId;
    const results = await this.questionsService.bulkCreateQuestions(dto, schoolId, req.user.id);
    await this.auditService.record({
      action: 'questions.bulk_created',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId,
      targetType: 'question',
      detail: { count: results.length },
    });
    return { count: results.length, results };
  }

  @Post('bulk/update')
  async bulkUpdateQuestions(@Body() body: unknown, @Request() req: any) {
    const dto = body as BulkUpdateQuestionsDto;
    const results = await this.questionsService.bulkUpdateQuestions(dto);
    await this.auditService.record({
      action: 'questions.bulk_updated',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'question',
      detail: { count: results.length },
    });
    return { count: results.length, results };
  }

  @Post('bulk/approve')
  async bulkApproveQuestions(@Body() body: unknown, @Request() req: any) {
    const dto = body as BulkApproveQuestionsDto;
    const results = await this.questionsService.bulkApproveQuestions(dto);
    await this.auditService.record({
      action: 'questions.bulk_approved',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'question',
      detail: { count: results.length },
    });
    return { count: results.length, results };
  }

  @Post('bulk/retire')
  async bulkRetireQuestions(@Body() body: unknown, @Request() req: any) {
    const dto = body as BulkRetireQuestionsDto;
    const results = await this.questionsService.bulkRetireQuestions(dto);
    await this.auditService.record({
      action: 'questions.bulk_retired',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'question',
      detail: { count: results.length },
    });
    return { count: results.length, results };
  }

  @Post('bulk/tags')
  async bulkTagQuestions(@Body() body: unknown, @Request() req: any) {
    const dto = body as BulkTagQuestionsDto;
    const results = await this.questionsService.bulkTagQuestions(dto);
    await this.auditService.record({
      action: 'questions.bulk_tagged',
      outcome: 'success',
      actorUserId: req.user.id,
      schoolId: req.user.schoolId,
      targetType: 'question',
      detail: { count: results.length, operation: dto.operation },
    });
    return { count: results.length, results };
  }
}
