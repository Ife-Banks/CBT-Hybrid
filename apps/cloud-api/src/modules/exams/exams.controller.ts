import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
import { ExamsService } from './exams.service';
import { ExamBuilderService } from './exam-builder.service';
import { ExamSchedulerService } from './exam-scheduler.service';
import { ExamPackService } from './exam-pack.service';
import type { CreateClassDto, CreateExamDto, UpdateExamDto, CreateSittingDto, UpdateSittingDto, QuestionSelection } from './domain/types';
import { createClassSchema, createExamSchema, updateExamSchema, createSittingSchema, updateSittingSchema, questionSelectionSchema } from './dto/exams.dto';

@Controller('exams')
@UseGuards(AuthGuard, AbilitiesGuard)
export class ExamsController {
  constructor(
    private readonly examsService: ExamsService,
    private readonly examBuilderService: ExamBuilderService,
    private readonly examSchedulerService: ExamSchedulerService,
    private readonly examPackService: ExamPackService,
  ) {}

  // Class endpoints
  @Post('classes')
  async createClass(@Body() dto: CreateClassDto) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examsService.createClass(dto, 'school-id', 'user-id');
  }

  @Get('classes/:id')
  async getClass(@Param('id') id: string) {
    return this.examsService.getClass(id);
  }

  @Get('classes')
  async listClasses() {
    // TODO: Extract schoolId from request
    return this.examsService.listClasses('school-id');
  }

  @Put('classes/:id')
  async updateClass(@Param('id') id: string, @Body() dto: Partial<CreateClassDto>) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examsService.updateClass(id, dto, 'school-id', 'user-id');
  }

  @Delete('classes/:id')
  async deleteClass(@Param('id') id: string) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examsService.deleteClass(id, 'school-id', 'user-id');
  }

  // Exam endpoints
  @Post()
  async createExam(@Body() dto: CreateExamDto) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examsService.createExam(dto, 'school-id', 'user-id');
  }

  @Get(':id')
  async getExam(@Param('id') id: string) {
    return this.examsService.getExam(id);
  }

  @Get()
  async listExams() {
    // TODO: Extract schoolId from request
    return this.examsService.listExams('school-id');
  }

  @Get('subject/:subjectId')
  async listExamsBySubject(@Param('subjectId') subjectId: string) {
    return this.examsService.listExamsBySubject(subjectId);
  }

  @Put(':id')
  async updateExam(@Param('id') id: string, @Body() dto: UpdateExamDto) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examsService.updateExam(id, dto, 'school-id', 'user-id');
  }

  @Delete(':id')
  async deleteExam(@Param('id') id: string) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examsService.deleteExam(id, 'school-id', 'user-id');
  }

  // Exam question endpoints
  @Post(':id/questions')
  async addQuestionToExam(
    @Param('id') id: string,
    @Body() body: { questionId: string; position: number; marksOverride?: number },
  ) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examsService.addQuestionToExam(
      id,
      body.questionId,
      body.position,
      body.marksOverride,
      'school-id',
      'user-id',
    );
  }

  @Delete(':id/questions/:questionId')
  async removeQuestionFromExam(@Param('id') id: string, @Param('questionId') questionId: string) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examsService.removeQuestionFromExam(id, questionId, 'school-id', 'user-id');
  }

  @Get(':id/questions')
  async getExamQuestions(@Param('id') id: string) {
    // TODO: Extract schoolId from request
    return this.examsService.getExamQuestions(id, 'school-id');
  }

  // Exam builder endpoints
  @Post(':id/questions/bulk')
  async addQuestionsToExam(@Param('id') id: string, @Body() selection: QuestionSelection) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examBuilderService.addQuestionsToExam(id, selection, 'school-id', 'user-id');
  }

  @Put(':id/questions/reorder')
  async reorderQuestions(
    @Param('id') id: string,
    @Body() body: { questionPositions: Array<{ questionId: string; position: number }> },
  ) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examBuilderService.reorderQuestions(id, body.questionPositions, 'school-id', 'user-id');
  }

  @Delete(':id/questions')
  async clearQuestions(@Param('id') id: string) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examBuilderService.clearQuestions(id, 'school-id', 'user-id');
  }

  @Post(':id/duplicate')
  async duplicateExam(@Param('id') id: string) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examBuilderService.duplicateExam(id, 'school-id', 'user-id');
  }

  // Pack endpoints (Phase 6B)
  @Post(':id/publish')
  async publishExam(@Param('id') id: string, @Request() req: any) {
    return this.examPackService.generatePack(id, req.user.schoolId, req.user.id);
  }

  @Get(':id/packs')
  async listPacks(@Param('id') id: string, @Request() req: any) {
    return this.examPackService.listPacks(id, req.user.schoolId);
  }

  // Sitting endpoints
  @Post('sittings')
  async createSitting(@Body() dto: CreateSittingDto) {    // TODO: Extract schoolId and actorUserId from request
    return this.examsService.createSitting(dto, 'school-id', 'user-id');
  }

  @Get('sittings/:id')
  async getSitting(@Param('id') id: string) {
    return this.examsService.getSitting(id);
  }

  @Get('sittings')
  async listSittings() {
    // TODO: Extract schoolId from request
    return this.examsService.listSittings('school-id');
  }

  @Get(':id/sittings')
  async listSittingsByExam(@Param('id') id: string) {
    // TODO: Extract schoolId from request
    return this.examsService.listSittingsByExam(id, 'school-id');
  }

  @Get('classes/:classId/sittings')
  async listSittingsByClass(@Param('classId') classId: string) {
    // TODO: Extract schoolId from request
    return this.examsService.listSittingsByClass(classId, 'school-id');
  }

  @Put('sittings/:id')
  async updateSitting(@Param('id') id: string, @Body() dto: UpdateSittingDto) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examsService.updateSitting(id, dto, 'school-id', 'user-id');
  }

  @Delete('sittings/:id')
  async deleteSitting(@Param('id') id: string) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examsService.deleteSitting(id, 'school-id', 'user-id');
  }

  // Scheduler endpoints
  @Post('sittings/:id/open')
  async openSitting(@Param('id') id: string) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examSchedulerService.openSitting(id, 'school-id', 'user-id');
  }

  @Post('sittings/:id/close')
  async closeSitting(@Param('id') id: string) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examSchedulerService.closeSitting(id, 'school-id', 'user-id');
  }

  @Post('sittings/:id/cancel')
  async cancelSitting(@Param('id') id: string) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examSchedulerService.cancelSitting(id, 'school-id', 'user-id');
  }

  @Post(':id/sittings/bulk')
  async scheduleBulkSittings(
    @Param('id') id: string,
    @Body() body: { classIds: string[]; windowStart: Date; windowEnd: Date; extraTimeMin: number },
  ) {
    // TODO: Extract schoolId and actorUserId from request
    return this.examSchedulerService.scheduleBulkSittings(
      id,
      body.classIds,
      body.windowStart,
      body.windowEnd,
      body.extraTimeMin,
      'school-id',
      'user-id',
    );
  }

  @Get('sittings/upcoming')
  async getUpcomingSittings() {
    // TODO: Extract schoolId from request
    return this.examSchedulerService.getUpcomingSittings('school-id');
  }

  @Get('sittings/active')
  async getActiveSittings() {
    // TODO: Extract schoolId from request
    return this.examSchedulerService.getActiveSittings('school-id');
  }

  @Get('sittings/past')
  async getPastSittings() {
    // TODO: Extract schoolId from request
    return this.examSchedulerService.getPastSittings('school-id');
  }
}
