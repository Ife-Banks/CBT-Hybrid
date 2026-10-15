import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { eq, asc } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { subjects } from '@cbt/shared-types';
import type { SubjectDomainRecord, CreateSubjectDto, UpdateSubjectDto } from '../domain/types';
import { mapSubjectFromDb } from '../domain/mappers';
import type { SubjectRepository } from './subject.repository';

@Injectable()
export class DrizzleSubjectRepository implements SubjectRepository {
  constructor(private readonly db: DrizzleDB) {}

  async findById(id: string): Promise<SubjectDomainRecord | null> {
    const row = await this.db.query.subjects.findFirst({
      where: eq(subjects.id, id),
    });
    return row ? mapSubjectFromDb(row) : null;
  }

  async findBySchoolId(schoolId: string): Promise<SubjectDomainRecord[]> {
    const rows = await this.db.query.subjects.findMany({
      where: eq(subjects.schoolId, schoolId),
      orderBy: [asc(subjects.name)],
    });
    return rows.map(mapSubjectFromDb);
  }

  async findByName(schoolId: string, name: string): Promise<SubjectDomainRecord | null> {
    const row = await this.db.query.subjects.findFirst({
      where: eq(subjects.schoolId, schoolId),
    });

    if (!row) return null;

    // Check name uniqueness manually since we can't use .where with unique constraint
    const allSubjects = await this.findBySchoolId(schoolId);
    return allSubjects.find((s) => s.name === name) ?? null;
  }

  async create(dto: CreateSubjectDto, schoolId: string): Promise<SubjectDomainRecord> {
    // Check for duplicate name
    const existing = await this.findByName(schoolId, dto.name);
    if (existing) {
      throw new ConflictException(`Subject with name "${dto.name}" already exists`);
    }

    const rows = await this.db
      .insert(subjects)
      .values({
        id: crypto.randomUUID(),
        schoolId,
        name: dto.name,
        code: dto.code ?? null,
        section: dto.section ?? null,
      })
      .returning();

    if (!rows[0]) {
      throw new Error('Failed to create subject');
    }

    return mapSubjectFromDb(rows[0]);
  }

  async update(id: string, dto: UpdateSubjectDto): Promise<SubjectDomainRecord> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Subject with ID ${id} not found`);
    }

    const rows = await this.db
      .update(subjects)
      .set({
        name: dto.name,
        code: dto.code ?? null,
        section: dto.section ?? null,
      })
      .where(eq(subjects.id, id))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Subject with ID ${id} not found after update`);
    }

    return mapSubjectFromDb(rows[0]);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Subject with ID ${id} not found`);
    }

    await this.db.delete(subjects).where(eq(subjects.id, id));
  }
}
