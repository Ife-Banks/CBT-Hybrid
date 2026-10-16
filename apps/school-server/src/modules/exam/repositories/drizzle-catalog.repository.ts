import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { DrizzleSqliteService } from '../../../shared/database/drizzle-sqlite.service';
import type { SqliteDB } from '../../../shared/database/drizzle-sqlite.service';
import { classes, exams, seats, sittings, students, subjects } from '../../../shared/database/schema';
import { toExamRecord, toSittingRecord, toStudentRecord } from '../domain/mappers';
import type {
  ExamRecord,
  ExamSettings,
  SeatRecord,
  SittingRecord,
  StudentRecord,
  SubjectRecord,
} from '../domain/types';
import type { CatalogRepository } from './catalog.repository';

@Injectable()
export class DrizzleCatalogRepository implements CatalogRepository {
  constructor(@Inject(DrizzleSqliteService) private readonly drizzle: DrizzleSqliteService) {}

  private get db(): SqliteDB {
    return this.drizzle.getDb();
  }

  async findStudentByCode(code: string): Promise<StudentRecord | null> {
    const rows = await this.db.select().from(students).where(eq(students.code, code)).limit(1);
    return rows[0] ? toStudentRecord(rows[0]) : null;
  }

  async findStudentById(id: string): Promise<StudentRecord | null> {
    const rows = await this.db.select().from(students).where(eq(students.id, id)).limit(1);
    return rows[0] ? toStudentRecord(rows[0]) : null;
  }

  async findClassName(classId: string | null): Promise<string | null> {
    if (!classId) return null;
    const rows = await this.db
      .select({ name: classes.name })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    return rows[0]?.name ?? null;
  }

  async findSubjectName(subjectId: string | null): Promise<string | null> {
    if (!subjectId) return null;
    const rows = await this.db
      .select({ name: subjects.name })
      .from(subjects)
      .where(eq(subjects.id, subjectId))
      .limit(1);
    return rows[0]?.name ?? null;
  }

  async findExam(examId: string): Promise<ExamRecord | null> {
    const rows = await this.db.select().from(exams).where(eq(exams.id, examId)).limit(1);
    return rows[0] ? toExamRecord(rows[0]) : null;
  }

  async upsertSubject(subject: SubjectRecord): Promise<void> {
    await this.db
      .insert(subjects)
      .values({ id: subject.id, name: subject.name, code: subject.code })
      .onConflictDoUpdate({
        target: subjects.id,
        set: { name: subject.name, code: subject.code },
      });
  }

  async upsertExam(exam: {
    id: string;
    title: string;
    subjectId: string | null;
    durationMin: number;
    settings: ExamSettings;
    syncedAt: string;
  }): Promise<void> {
    const values = {
      id: exam.id,
      title: exam.title,
      subjectId: exam.subjectId,
      durationMin: exam.durationMin,
      settingsJson: JSON.stringify(exam.settings),
      syncedAt: exam.syncedAt,
    };
    await this.db
      .insert(exams)
      .values(values)
      .onConflictDoUpdate({
        target: exams.id,
        set: {
          title: values.title,
          subjectId: values.subjectId,
          durationMin: values.durationMin,
          settingsJson: values.settingsJson,
          syncedAt: values.syncedAt,
        },
      });
  }

  async findSitting(id: string): Promise<SittingRecord | null> {
    const rows = await this.db.select().from(sittings).where(eq(sittings.id, id)).limit(1);
    return rows[0] ? toSittingRecord(rows[0]) : null;
  }

  async listOpenSittingsForClass(classId: string): Promise<SittingRecord[]> {
    const rows = await this.db
      .select()
      .from(sittings)
      .where(and(eq(sittings.classId, classId), eq(sittings.status, 'open')));
    return rows.map(toSittingRecord);
  }

  async countOpenSittings(): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(sittings)
      .where(eq(sittings.status, 'open'));
    return Number(rows[0]?.value ?? 0);
  }

  async findSeatByIp(ip: string): Promise<SeatRecord | null> {
    const rows = await this.db.select().from(seats).where(eq(seats.lastIp, ip)).limit(1);
    const row = rows[0];
    return row
      ? { code: row.code, label: row.label, lastSeenAt: row.lastSeenAt, lastIp: row.lastIp }
      : null;
  }

  async touchSeat(code: string, at: string, ip: string | null): Promise<void> {
    await this.db
      .insert(seats)
      .values({ code, lastSeenAt: at, lastIp: ip })
      .onConflictDoUpdate({ target: seats.code, set: { lastSeenAt: at, lastIp: ip } });
  }
}
