import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, asc } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { DrizzleService } from '../../../shared/database/drizzle.service';
import { students, studentCodes } from '@cbt/shared-types';
import type { StudentRecord, CreateStudentDto, UpdateStudentDto } from '../domain/types';
import { mapStudentFromDb } from '../domain/mappers';

export interface StudentRepository {
  findById(id: string): Promise<StudentRecord | null>;
  findBySchoolId(schoolId: string): Promise<StudentRecord[]>;
  findByAdmissionNo(schoolId: string, admissionNo: string): Promise<StudentRecord | null>;
  create(dto: CreateStudentDto, schoolId: string): Promise<StudentRecord>;
  update(id: string, dto: UpdateStudentDto): Promise<StudentRecord>;
  delete(id: string): Promise<void>;
}

@Injectable()
export class DrizzleStudentRepository implements StudentRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async findById(id: string): Promise<StudentRecord | null> {
    const row = await this.db.query.students.findFirst({
      where: eq(students.id, id),
    });
    return row ? mapStudentFromDb(row) : null;
  }

  async findBySchoolId(schoolId: string): Promise<StudentRecord[]> {
    const rows = await this.db.query.students.findMany({
      where: eq(students.schoolId, schoolId),
      orderBy: [asc(students.lastName), asc(students.firstName)],
    });
    return rows.map(mapStudentFromDb);
  }

  async findByAdmissionNo(schoolId: string, admissionNo: string): Promise<StudentRecord | null> {
    const row = await this.db.query.students.findFirst({
      where: and(eq(students.schoolId, schoolId), eq(students.admissionNo, admissionNo)),
    });
    return row ? mapStudentFromDb(row) : null;
  }

  async create(dto: CreateStudentDto, schoolId: string): Promise<StudentRecord> {
    const rows = await this.db
      .insert(students)
      .values({
        id: crypto.randomUUID(),
        schoolId,
        admissionNo: dto.admissionNo,
        firstName: dto.firstName,
        lastName: dto.lastName,
        otherNames: dto.otherNames ?? null,
        gender: dto.gender ?? null,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        metadata: (dto.metadata as any) ?? {},
        status: 'active',
      })
      .returning();

    if (!rows[0]) {
      throw new Error('Failed to create student');
    }

    return mapStudentFromDb(rows[0]);
  }

  async update(id: string, dto: UpdateStudentDto): Promise<StudentRecord> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Student with ID ${id} not found`);
    }

    const rows = await this.db
      .update(students)
      .set({
        firstName: dto.firstName,
        lastName: dto.lastName,
        otherNames: dto.otherNames ?? null,
        gender: dto.gender ?? null,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        photoAssetId: dto.photoAssetId ?? null,
        status: dto.status,
        metadata: dto.metadata ? (dto.metadata as any) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(students.id, id))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Student with ID ${id} not found after update`);
    }

    return mapStudentFromDb(rows[0]);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(students).where(eq(students.id, id));
  }
}
