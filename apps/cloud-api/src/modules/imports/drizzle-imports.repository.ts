import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import {
  classes,
  guardians,
  guardianships,
  importJobRows,
  importJobs,
  levels,
  questionOptions,
  questions,
  students,
  subjects,
  teacherProfiles,
  users,
} from '@cbt/shared-types';
import { DrizzleService, type DrizzleDB } from '../../shared/database/drizzle.service';
import type {
  CreateImportJobInput,
  ImportJobPatch,
  ImportJobRecord,
  ImportKind,
  ImportReferenceData,
  ImportRowPatch,
  ImportRowRecord,
  ImportRowStatus,
  ParsedRowInput,
} from './domain/types';
import type { ImportRepository, RowPage } from './imports.repository';

type JobRow = typeof importJobs.$inferSelect;
type JobRowRow = typeof importJobRows.$inferSelect;

/** Drizzle-backed import pipeline store (API spec section 7). */
@Injectable()
export class DrizzleImportRepository implements ImportRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async createJob(input: CreateImportJobInput): Promise<ImportJobRecord> {
    const [row] = await this.db
      .insert(importJobs)
      .values({
        schoolId: input.schoolId,
        kind: input.kind,
        status: 'queued',
        sourceFile: input.sourceFile,
        subjectId: input.subjectId ?? null,
        levelId: input.levelId ?? null,
        uploadedBy: input.uploadedBy,
      })
      .returning();
    return mapJob(row!);
  }

  async updateJob(id: string, patch: ImportJobPatch): Promise<ImportJobRecord | null> {
    const [row] = await this.db
      .update(importJobs)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, id))
      .returning();
    return row ? mapJob(row) : null;
  }

  async getJob(id: string): Promise<ImportJobRecord | null> {
    const [row] = await this.db.select().from(importJobs).where(eq(importJobs.id, id)).limit(1);
    return row ? mapJob(row) : null;
  }

  async listJobs(
    schoolId: string,
    filter: { kind?: ImportKind; uploadedBy?: string },
  ): Promise<ImportJobRecord[]> {
    const conditions = [eq(importJobs.schoolId, schoolId)];
    if (filter.kind) {
      const kinds = kindValues(filter.kind);
      conditions.push(inArray(importJobs.kind, kinds as never[]));
    }
    if (filter.uploadedBy) conditions.push(eq(importJobs.uploadedBy, filter.uploadedBy));
    const rows = await this.db
      .select()
      .from(importJobs)
      .where(and(...conditions))
      .orderBy(desc(importJobs.createdAt));
    return rows.map(mapJob);
  }

  async deleteJob(id: string): Promise<void> {
    await this.db.delete(importJobs).where(eq(importJobs.id, id));
  }

  async insertRows(jobId: string, rows: ParsedRowInput[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(importJobRows).values(
      rows.map((row) => ({
        jobId,
        rowNo: row.rowNo,
        status: row.status,
        raw: row.raw,
        parsed: row.parsed,
        errors: row.errors,
      })),
    );
  }

  async listRows(
    jobId: string,
    filter: { status?: ImportRowStatus; cursor?: number; limit?: number },
  ): Promise<RowPage> {
    const conditions = [eq(importJobRows.jobId, jobId)];
    if (filter.status) conditions.push(eq(importJobRows.status, filter.status));
    const limit = filter.limit ?? 50;
    const offset = filter.cursor ?? 0;
    const rows = await this.db
      .select()
      .from(importJobRows)
      .where(and(...conditions))
      .orderBy(asc(importJobRows.rowNo))
      .limit(limit + 1)
      .offset(offset);
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(mapRow);
    return { items, nextCursor: hasMore ? offset + limit : null };
  }

  async getRow(jobId: string, rowId: string): Promise<ImportRowRecord | null> {
    const [row] = await this.db
      .select()
      .from(importJobRows)
      .where(and(eq(importJobRows.jobId, jobId), eq(importJobRows.id, rowId)))
      .limit(1);
    return row ? mapRow(row) : null;
  }

  async updateRow(
    jobId: string,
    rowId: string,
    patch: ImportRowPatch,
  ): Promise<ImportRowRecord | null> {
    const [row] = await this.db
      .update(importJobRows)
      .set(patch)
      .where(and(eq(importJobRows.jobId, jobId), eq(importJobRows.id, rowId)))
      .returning();
    return row ? mapRow(row) : null;
  }

  async countRows(jobId: string): Promise<Record<ImportRowStatus, number>> {
    const rows = await this.db
      .select({ status: importJobRows.status })
      .from(importJobRows)
      .where(eq(importJobRows.jobId, jobId));
    const counts: Record<ImportRowStatus, number> = {
      ok: 0,
      warning: 0,
      error: 0,
      skipped: 0,
      imported: 0,
    };
    for (const row of rows) counts[row.status] += 1;
    return counts;
  }

  async loadReferenceData(schoolId: string): Promise<ImportReferenceData> {
    const [questionRows, subjectRows, levelRows, classRows, studentRows, guardianRows, userRows] =
      await Promise.all([
        this.db
          .select({ stem: questions.stem })
          .from(questions)
          .where(eq(questions.schoolId, schoolId)),
        this.db
          .select({ id: subjects.id, name: subjects.name })
          .from(subjects)
          .where(eq(subjects.schoolId, schoolId)),
        this.db
          .select({ id: levels.id, name: levels.name })
          .from(levels)
          .where(eq(levels.schoolId, schoolId)),
        this.db
          .select({ id: classes.id, name: classes.name })
          .from(classes)
          .where(eq(classes.schoolId, schoolId)),
        this.db
          .select({ admissionNo: students.admissionNo })
          .from(students)
          .where(eq(students.schoolId, schoolId)),
        this.db
          .select({ phone: guardians.phoneE164, name: guardians.fullName })
          .from(guardians)
          .where(and(eq(guardians.schoolId, schoolId), isNotNull(guardians.phoneE164))),
        this.db
          .select({ email: users.email })
          .from(users)
          .where(and(eq(users.schoolId, schoolId), isNotNull(users.email))),
      ]);

    return {
      questionStems: questionRows.map((row) => row.stem.trim().toLowerCase()),
      subjectsByName: new Map(subjectRows.map((row) => [row.name.toLowerCase(), row.id])),
      levelsByName: new Map(levelRows.map((row) => [row.name.toLowerCase(), row.id])),
      classesByName: new Map(classRows.map((row) => [row.name.toLowerCase(), row.id])),
      admissionNos: studentRows.map((row) => row.admissionNo.toLowerCase()),
      guardiansByPhone: new Map(
        guardianRows.map((row) => [(row.phone ?? '').replace(/[^\d+]/g, '').replace(/^\+/, ''), row.name]),
      ),
      userEmails: userRows.map((row) => (row.email ?? '').toLowerCase()),
    };
  }

  async createQuestions(
    schoolId: string,
    rows: ImportRowRecord[],
    context: { subjectId: string | null; levelId: string | null; createdBy: string },
  ): Promise<number> {
    let created = 0;
    for (const row of rows) {
      if (row.status === 'error' || row.status === 'skipped') continue;
      const parsed = (row.parsed ?? {}) as Record<string, any>;
      const subjectId = (parsed.subject_id as string | null) ?? context.subjectId;
      if (!subjectId) continue;

      const [question] = await this.db
        .insert(questions)
        .values({
          schoolId,
          subjectId,
          levelId: (parsed.level_id as string | null) ?? context.levelId ?? null,
          type: parsed.type,
          stem: parsed.stem,
          marks: String(parsed.marks ?? 1),
          difficulty: parsed.difficulty ?? null,
          topic: parsed.topic ?? null,
          explanation: parsed.explanation ?? null,
          fillAnswers: parsed.fill_answers ?? null,
          status: 'draft',
          createdBy: context.createdBy,
          importRowId: row.id,
        })
        .returning({ id: questions.id });

      const options = (parsed.options ?? []) as Array<{
        label: string;
        body: string;
        is_correct: boolean;
      }>;
      if ((parsed.type === 'single_choice' || parsed.type === 'multi_choice') && options.length > 0) {
        await this.db.insert(questionOptions).values(
          options.map((option, index) => ({
            questionId: question!.id,
            label: option.label,
            body: option.body,
            isCorrect: option.is_correct,
            sortOrder: index,
          })),
        );
      }
      created += 1;
    }
    return created;
  }

  async createStudents(schoolId: string, rows: ImportRowRecord[]): Promise<number> {
    let created = 0;
    for (const row of rows) {
      if (row.status === 'error' || row.status === 'skipped') continue;
      const parsed = (row.parsed ?? {}) as Record<string, any>;
      await this.db.insert(students).values({
        schoolId,
        admissionNo: parsed.admission_no,
        firstName: parsed.first_name,
        lastName: parsed.last_name,
        otherNames: parsed.other_names ?? null,
        gender: parsed.gender ?? null,
        dateOfBirth: parsed.date_of_birth ? new Date(parsed.date_of_birth) : null,
        status: 'active',
      });
      created += 1;
    }
    return created;
  }

  async createGuardians(schoolId: string, rows: ImportRowRecord[]): Promise<number> {
    let created = 0;
    for (const row of rows) {
      if (row.status === 'error' || row.status === 'skipped') continue;
      const parsed = (row.parsed ?? {}) as Record<string, any>;
      const [guardian] = await this.db
        .insert(guardians)
        .values({
          schoolId,
          fullName: parsed.full_name,
          email: parsed.email ?? null,
          phoneE164: parsed.phone_e164 ?? null,
          relationship: parsed.relationship ?? null,
        })
        .returning({ id: guardians.id });

      const admissionNos = (parsed.child_admission_nos ?? []) as string[];
      if (admissionNos.length > 0 && guardian) {
        const childRows = await this.db
          .select({ id: students.id, admissionNo: students.admissionNo })
          .from(students)
          .where(and(eq(students.schoolId, schoolId), inArray(students.admissionNo, admissionNos)));
        if (childRows.length > 0) {
          await this.db.insert(guardianships).values(
            childRows.map((child) => ({
              guardianId: guardian.id,
              studentId: child.id,
              relationship: parsed.relationship ?? null,
              canViewResults: parsed.can_view_results ?? true,
            })),
          );
        }
      }
      created += 1;
    }
    return created;
  }

  async createTeachers(schoolId: string, rows: ImportRowRecord[]): Promise<number> {
    let created = 0;
    for (const row of rows) {
      if (row.status === 'error' || row.status === 'skipped') continue;
      const parsed = (row.parsed ?? {}) as Record<string, any>;
      const [user] = await this.db
        .insert(users)
        .values({
          schoolId,
          role: 'teacher',
          fullName: parsed.full_name,
          email: parsed.email ?? null,
          phoneE164: parsed.phone_e164 ?? null,
          passwordHash: '',
          status: 'invited',
        })
        .returning({ id: users.id });
      if (user) {
        await this.db.insert(teacherProfiles).values({
          userId: user.id,
          staffNo: parsed.staff_no ?? null,
        });
      }
      created += 1;
    }
    return created;
  }
}

function kindValues(kind: ImportKind): string[] {
  if (kind === 'questions') return ['questions_docx', 'questions_xlsx'];
  return [kind];
}

function mapJob(row: JobRow): ImportJobRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    kind: row.kind as ImportJobRecord['kind'],
    status: row.status as ImportJobRecord['status'],
    sourceFile: row.sourceFile,
    subjectId: row.subjectId,
    levelId: row.levelId,
    uploadedBy: row.uploadedBy,
    totalRows: row.totalRows ?? 0,
    processedRows: row.processedRows ?? 0,
    succeededRows: row.succeededRows ?? 0,
    failedRows: row.failedRows ?? 0,
    failureReason: row.failureReason,
    errorSummary: (row.errorSummary as Record<string, unknown> | null) ?? null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapRow(row: JobRowRow): ImportRowRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    rowNo: row.rowNo,
    status: row.status as ImportRowStatus,
    raw: (row.raw as Record<string, unknown> | null) ?? null,
    parsed: (row.parsed as Record<string, unknown> | null) ?? null,
    errors: (row.errors as ImportRowRecord['errors']) ?? [],
    createdAt: row.createdAt.toISOString(),
  };
}
