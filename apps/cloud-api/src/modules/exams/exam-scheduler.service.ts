import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { SittingRepository, ExamRepository } from './repositories';
import { DrizzleExamRepository, DrizzleSittingRepository } from './repositories';
import type { SittingDomainRecord, CreateSittingDto } from './domain/types';
import { AuditService } from '../auth/audit/audit.service';

@Injectable()
export class ExamSchedulerService {
  constructor(
    @Optional() @Inject(DrizzleSittingRepository) private readonly sittingRepo?: SittingRepository,
    @Optional() @Inject(DrizzleExamRepository) private readonly examRepo?: ExamRepository,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  /**
   * Open a sitting (make it available for students)
   */
  async openSitting(sittingId: string, schoolId: string, actorUserId: string): Promise<SittingDomainRecord> {
    const sitting = await this.sittingRepo!.findById(sittingId);
    if (!sitting) {
      throw new NotFoundException('Sitting not found');
    }
    if (sitting.schoolId !== schoolId) {
      throw new ConflictException('Sitting does not belong to this school');
    }
    if (sitting.status !== 'scheduled') {
      throw new ConflictException('Can only open a scheduled sitting');
    }

    const now = new Date();
    if (now < sitting.windowStart) {
      throw new ConflictException('Cannot open sitting before its scheduled start time');
    }
    if (now > sitting.windowEnd) {
      throw new ConflictException('Cannot open sitting after its scheduled end time');
    }

    const updated = await this.sittingRepo!.update(sittingId, {
      status: 'open',
    });

    await this.auditService!.record({
      action: 'sitting.opened',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: sittingId,
      targetType: 'sitting',
      detail: { examId: sitting.examId, classId: sitting.classId },
    });

    return updated;
  }

  /**
   * Close a sitting (end the exam for all students)
   */
  async closeSitting(sittingId: string, schoolId: string, actorUserId: string): Promise<SittingDomainRecord> {
    const sitting = await this.sittingRepo!.findById(sittingId);
    if (!sitting) {
      throw new NotFoundException('Sitting not found');
    }
    if (sitting.schoolId !== schoolId) {
      throw new ConflictException('Sitting does not belong to this school');
    }
    if (sitting.status !== 'open') {
      throw new ConflictException('Can only close an open sitting');
    }

    const updated = await this.sittingRepo!.update(sittingId, {
      status: 'closed',
    });

    await this.auditService!.record({
      action: 'sitting.closed',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: sittingId,
      targetType: 'sitting',
      detail: { examId: sitting.examId, classId: sitting.classId, closedBy: actorUserId },
    });

    return updated;
  }

  /**
   * Cancel a sitting
   */
  async cancelSitting(sittingId: string, schoolId: string, actorUserId: string): Promise<SittingDomainRecord> {
    const sitting = await this.sittingRepo!.findById(sittingId);
    if (!sitting) {
      throw new NotFoundException('Sitting not found');
    }
    if (sitting.schoolId !== schoolId) {
      throw new ConflictException('Sitting does not belong to this school');
    }
    if (sitting.status === 'closed') {
      throw new ConflictException('Cannot cancel a closed sitting');
    }

    const updated = await this.sittingRepo!.update(sittingId, {
      status: 'cancelled',
    });

    await this.auditService!.record({
      action: 'sitting.cancelled',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: sittingId,
      targetType: 'sitting',
      detail: { examId: sitting.examId, classId: sitting.classId },
    });

    return updated;
  }

  /**
   * Schedule a sitting for multiple classes at once
   */
  async scheduleBulkSittings(
    examId: string,
    classIds: string[],
    windowStart: Date,
    windowEnd: Date,
    extraTimeMin: number,
    schoolId: string,
    actorUserId: string,
  ): Promise<SittingDomainRecord[]> {
    const exam = await this.examRepo!.findById(examId);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.schoolId !== schoolId) {
      throw new ConflictException('Exam does not belong to this school');
    }

    const sittings: SittingDomainRecord[] = [];
    for (const classId of classIds) {
      const sitting = await this.sittingRepo!.create(
        {
          examId,
          classId,
          windowStart,
          windowEnd,
          extraTimeMin,
        },
        schoolId,
      );
      sittings.push(sitting);
    }

    await this.auditService!.record({
      action: 'sittings.bulk_scheduled',
      outcome: 'success',
      schoolId,
      actorUserId,
      targetId: examId,
      targetType: 'exam',
      detail: { count: sittings.length, windowStart, windowEnd },
    });

    return sittings;
  }

  /**
   * Get upcoming sittings (scheduled or open)
   */
  async getUpcomingSittings(schoolId: string): Promise<SittingDomainRecord[]> {
    const allSittings = await this.sittingRepo!.findBySchoolId(schoolId);
    const now = new Date();
    return allSittings.filter(
      (s) => (s.status === 'scheduled' || s.status === 'open') && s.windowEnd > now,
    );
  }

  /**
   * Get active sittings (currently open)
   */
  async getActiveSittings(schoolId: string): Promise<SittingDomainRecord[]> {
    const allSittings = await this.sittingRepo!.findBySchoolId(schoolId);
    const now = new Date();
    return allSittings.filter(
      (s) => s.status === 'open' && s.windowStart <= now && s.windowEnd > now,
    );
  }

  /**
   * Get past sittings (closed or cancelled)
   */
  async getPastSittings(schoolId: string): Promise<SittingDomainRecord[]> {
    const allSittings = await this.sittingRepo!.findBySchoolId(schoolId);
    const now = new Date();
    return allSittings.filter(
      (s) => (s.status === 'closed' || s.status === 'cancelled') || s.windowEnd < now,
    );
  }
}
