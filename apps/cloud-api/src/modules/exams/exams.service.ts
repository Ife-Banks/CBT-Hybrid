import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type {
  ClassRepository,
  ExamRepository,
  SittingRepository,
} from './repositories';
import {
  DrizzleClassRepository,
  DrizzleExamRepository,
  DrizzleSittingRepository,
} from './repositories';
import type {
  ClassDomainRecord,
  CreateClassDto,
  ExamDomainRecord,
  CreateExamDto,
  UpdateExamDto,
  SittingDomainRecord,
  CreateSittingDto,
  UpdateSittingDto,
} from './domain/types';
import { AuditService } from '../auth/audit/audit.service';

@Injectable()
export class ExamsService {
  constructor(
    @Optional() @Inject(DrizzleClassRepository) private readonly classRepo?: ClassRepository,
    @Optional() @Inject(DrizzleExamRepository) private readonly examRepo?: ExamRepository,
    @Optional() @Inject(DrizzleSittingRepository) private readonly sittingRepo?: SittingRepository,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  // Class management
  async createClass(dto: CreateClassDto, schoolId: string, actorUserId: string): Promise<ClassDomainRecord> {
    const cls = await this.classRepo!.create(dto, schoolId);
    await this.auditService!.record({
      action: 'class.created',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: cls.id,
      targetType: 'class',
      detail: { name: cls.name, section: cls.section },
    });
    return cls;
  }

  async getClass(id: string): Promise<ClassDomainRecord> {
    const cls = await this.classRepo!.findById(id);
    if (!cls) {
      throw new NotFoundException('Class not found');
    }
    return cls;
  }

  async listClasses(schoolId: string): Promise<ClassDomainRecord[]> {
    return this.classRepo!.findBySchoolId(schoolId);
  }

  async updateClass(id: string, dto: Partial<CreateClassDto>, schoolId: string, actorUserId: string): Promise<ClassDomainRecord> {
    const existing = await this.classRepo!.findById(id);
    if (!existing) {
      throw new NotFoundException('Class not found');
    }
    if (existing.schoolId !== schoolId) {
      throw new ConflictException('Class does not belong to this school');
    }
    const cls = await this.classRepo!.update(id, dto);
    await this.auditService!.record({
      action: 'class.updated',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: cls.id,
      targetType: 'class',
      detail: { name: cls.name, section: cls.section },
    });
    return cls;
  }

  async deleteClass(id: string, schoolId: string, actorUserId: string): Promise<void> {
    const existing = await this.classRepo!.findById(id);
    if (!existing) {
      throw new NotFoundException('Class not found');
    }
    if (existing.schoolId !== schoolId) {
      throw new ConflictException('Class does not belong to this school');
    }
    await this.classRepo!.delete(id);
    await this.auditService!.record({
      action: 'class.deleted',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: id,
      targetType: 'class',
      detail: { name: existing.name },
    });
  }

  // Exam management
  async createExam(dto: CreateExamDto, schoolId: string, actorUserId: string): Promise<ExamDomainRecord> {
    const exam = await this.examRepo!.create(dto, schoolId, actorUserId);
    await this.auditService!.record({
      action: 'exam.created',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: exam.id,
      targetType: 'exam',
      detail: { title: exam.title, subjectId: exam.subjectId },
    });
    return exam;
  }

  async getExam(id: string): Promise<ExamDomainRecord> {
    const exam = await this.examRepo!.findById(id);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    return exam;
  }

  async listExams(schoolId: string): Promise<ExamDomainRecord[]> {
    return this.examRepo!.findBySchoolId(schoolId);
  }

  async listExamsBySubject(subjectId: string): Promise<ExamDomainRecord[]> {
    return this.examRepo!.findBySubjectId(subjectId);
  }

  async updateExam(id: string, dto: UpdateExamDto, schoolId: string, actorUserId: string): Promise<ExamDomainRecord> {
    const existing = await this.examRepo!.findById(id);
    if (!existing) {
      throw new NotFoundException('Exam not found');
    }
    if (existing.schoolId !== schoolId) {
      throw new ConflictException('Exam does not belong to this school');
    }
    if (existing.status === 'published' || existing.status === 'archived') {
      throw new ConflictException('Cannot update a published or archived exam');
    }
    const exam = await this.examRepo!.update(id, dto);
    await this.auditService!.record({
      action: 'exam.updated',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: exam.id,
      targetType: 'exam',
      detail: { title: exam.title, status: exam.status },
    });
    return exam;
  }

  async deleteExam(id: string, schoolId: string, actorUserId: string): Promise<void> {
    const existing = await this.examRepo!.findById(id);
    if (!existing) {
      throw new NotFoundException('Exam not found');
    }
    if (existing.schoolId !== schoolId) {
      throw new ConflictException('Exam does not belong to this school');
    }
    if (existing.status === 'published') {
      throw new ConflictException('Cannot delete a published exam');
    }
    await this.examRepo!.delete(id);
    await this.auditService!.record({
      action: 'exam.deleted',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: id,
      targetType: 'exam',
      detail: { title: existing.title },
    });
  }

  // Question management in exams
  async addQuestionToExam(examId: string, questionId: string, position: number, marksOverride: number | undefined, schoolId: string, actorUserId: string): Promise<void> {
    const exam = await this.examRepo!.findById(examId);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.schoolId !== schoolId) {
      throw new ConflictException('Exam does not belong to this school');
    }
    if (exam.status === 'published' || exam.status === 'archived') {
      throw new ConflictException('Cannot modify questions in a published or archived exam');
    }
    await this.examRepo!.addQuestion(examId, questionId, position, marksOverride);
    await this.auditService!.record({
      action: 'exam.question_added',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: examId,
      targetType: 'exam',
      detail: { questionId, position },
    });
  }

  async removeQuestionFromExam(examId: string, questionId: string, schoolId: string, actorUserId: string): Promise<void> {
    const exam = await this.examRepo!.findById(examId);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.schoolId !== schoolId) {
      throw new ConflictException('Exam does not belong to this school');
    }
    if (exam.status === 'published' || exam.status === 'archived') {
      throw new ConflictException('Cannot modify questions in a published or archived exam');
    }
    await this.examRepo!.removeQuestion(examId, questionId);
    await this.auditService!.record({
      action: 'exam.question_removed',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: examId,
      targetType: 'exam',
      detail: { questionId },
    });
  }

  async getExamQuestions(examId: string, schoolId: string): Promise<Array<{ questionId: string; position: number; marksOverride?: number }>> {
    const exam = await this.examRepo!.findById(examId);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.schoolId !== schoolId) {
      throw new ConflictException('Exam does not belong to this school');
    }
    return this.examRepo!.getQuestions(examId);
  }

  // Sitting management
  async createSitting(dto: CreateSittingDto, schoolId: string, actorUserId: string): Promise<SittingDomainRecord> {
    const exam = await this.examRepo!.findById(dto.examId);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.schoolId !== schoolId) {
      throw new ConflictException('Exam does not belong to this school');
    }
    const sitting = await this.sittingRepo!.create(dto, schoolId);
    await this.auditService!.record({
      action: 'sitting.created',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: sitting.id,
      targetType: 'sitting',
      detail: { examId: sitting.examId, classId: sitting.classId, windowStart: sitting.windowStart },
    });
    return sitting;
  }

  async getSitting(id: string): Promise<SittingDomainRecord> {
    const sitting = await this.sittingRepo!.findById(id);
    if (!sitting) {
      throw new NotFoundException('Sitting not found');
    }
    return sitting;
  }

  async listSittings(schoolId: string): Promise<SittingDomainRecord[]> {
    return this.sittingRepo!.findBySchoolId(schoolId);
  }

  async listSittingsByExam(examId: string, schoolId: string): Promise<SittingDomainRecord[]> {
    const exam = await this.examRepo!.findById(examId);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.schoolId !== schoolId) {
      throw new ConflictException('Exam does not belong to this school');
    }
    return this.sittingRepo!.findByExamId(examId);
  }

  async listSittingsByClass(classId: string, schoolId: string): Promise<SittingDomainRecord[]> {
    const cls = await this.classRepo!.findById(classId);
    if (!cls) {
      throw new NotFoundException('Class not found');
    }
    if (cls.schoolId !== schoolId) {
      throw new ConflictException('Class does not belong to this school');
    }
    return this.sittingRepo!.findByClassId(classId);
  }

  async updateSitting(id: string, dto: UpdateSittingDto, schoolId: string, actorUserId: string): Promise<SittingDomainRecord> {
    const existing = await this.sittingRepo!.findById(id);
    if (!existing) {
      throw new NotFoundException('Sitting not found');
    }
    if (existing.schoolId !== schoolId) {
      throw new ConflictException('Sitting does not belong to this school');
    }
    const sitting = await this.sittingRepo!.update(id, dto);
    await this.auditService!.record({
      action: 'sitting.updated',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: sitting.id,
      targetType: 'sitting',
      detail: { status: sitting.status },
    });
    return sitting;
  }

  async deleteSitting(id: string, schoolId: string, actorUserId: string): Promise<void> {
    const existing = await this.sittingRepo!.findById(id);
    if (!existing) {
      throw new NotFoundException('Sitting not found');
    }
    if (existing.schoolId !== schoolId) {
      throw new ConflictException('Sitting does not belong to this school');
    }
    if (existing.status === 'open') {
      throw new ConflictException('Cannot delete an open sitting');
    }
    await this.sittingRepo!.delete(id);
    await this.auditService!.record({
      action: 'sitting.deleted',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: id,
      targetType: 'sitting',
      detail: { examId: existing.examId },
    });
  }
}
