import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { guardianships } from '@cbt/shared-types';
import type { GuardianshipRecord } from '../domain/types';
import { mapGuardianshipFromDb } from '../domain/mappers';

export interface GuardianshipRepository {
  findByGuardianId(guardianId: string): Promise<GuardianshipRecord[]>;
  findByStudentId(studentId: string): Promise<GuardianshipRecord[]>;
  find(guardianId: string, studentId: string): Promise<GuardianshipRecord | null>;
  create(dto: Omit<GuardianshipRecord, 'createdAt'>): Promise<GuardianshipRecord>;
  update(guardianId: string, studentId: string, dto: Partial<Omit<GuardianshipRecord, 'guardianId' | 'studentId' | 'createdAt'>>): Promise<GuardianshipRecord>;
  delete(guardianId: string, studentId: string): Promise<void>;
}

@Injectable()
export class DrizzleGuardianshipRepository implements GuardianshipRepository {
  constructor(private readonly db: DrizzleDB) {}

  async findByGuardianId(guardianId: string): Promise<GuardianshipRecord[]> {
    const rows = await this.db.query.guardianships.findMany({
      where: eq(guardianships.guardianId, guardianId),
    });
    return rows.map(mapGuardianshipFromDb);
  }

  async findByStudentId(studentId: string): Promise<GuardianshipRecord[]> {
    const rows = await this.db.query.guardianships.findMany({
      where: eq(guardianships.studentId, studentId),
    });
    return rows.map(mapGuardianshipFromDb);
  }

  async find(guardianId: string, studentId: string): Promise<GuardianshipRecord | null> {
    const row = await this.db.query.guardianships.findFirst({
      where: and(eq(guardianships.guardianId, guardianId), eq(guardianships.studentId, studentId)),
    });
    return row ? mapGuardianshipFromDb(row) : null;
  }

  async create(dto: Omit<GuardianshipRecord, 'createdAt'>): Promise<GuardianshipRecord> {
    const rows = await this.db
      .insert(guardianships)
      .values({
        guardianId: dto.guardianId,
        studentId: dto.studentId,
        relationship: dto.relationship ?? null,
        canViewResults: dto.canViewResults,
        canPayFees: dto.canPayFees,
      })
      .returning();

    if (!rows[0]) {
      throw new Error('Failed to create guardianship');
    }

    return mapGuardianshipFromDb(rows[0]);
  }

  async update(
    guardianId: string,
    studentId: string,
    dto: Partial<Omit<GuardianshipRecord, 'guardianId' | 'studentId' | 'createdAt'>>,
  ): Promise<GuardianshipRecord> {
    const rows = await this.db
      .update(guardianships)
      .set({
        relationship: dto.relationship ?? null,
        canViewResults: dto.canViewResults,
        canPayFees: dto.canPayFees,
      })
      .where(and(eq(guardianships.guardianId, guardianId), eq(guardianships.studentId, studentId)))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Guardianship not found`);
    }

    return mapGuardianshipFromDb(rows[0]);
  }

  async delete(guardianId: string, studentId: string): Promise<void> {
    await this.db
      .delete(guardianships)
      .where(and(eq(guardianships.guardianId, guardianId), eq(guardianships.studentId, studentId)));
  }
}
