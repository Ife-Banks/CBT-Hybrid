import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, desc } from 'drizzle-orm';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { studentCodes } from '@cbt/shared-types';
import type { StudentCodeRecord } from '../domain/types';
import { mapStudentCodeFromDb } from '../domain/mappers';

export interface StudentCodeRepository {
  findById(id: string): Promise<StudentCodeRecord | null>;
  findByCode(code: string): Promise<StudentCodeRecord | null>;
  findByStudentId(studentId: string): Promise<StudentCodeRecord[]>;
  findActiveByStudentId(studentId: string): Promise<StudentCodeRecord | null>;
  create(studentId: string, code: string, issuedBy?: string): Promise<StudentCodeRecord>;
  revoke(id: string, reason: string): Promise<StudentCodeRecord>;
  revokeAllForStudent(studentId: string, reason: string): Promise<void>;
}

@Injectable()
export class DrizzleStudentCodeRepository implements StudentCodeRepository {
  constructor(private readonly db: DrizzleDB) {}

  async findById(id: string): Promise<StudentCodeRecord | null> {
    const row = await this.db.query.studentCodes.findFirst({
      where: eq(studentCodes.id, id),
    });
    return row ? mapStudentCodeFromDb(row) : null;
  }

  async findByCode(code: string): Promise<StudentCodeRecord | null> {
    const row = await this.db.query.studentCodes.findFirst({
      where: and(eq(studentCodes.code, code), eq(studentCodes.status, 'active')),
    });
    return row ? mapStudentCodeFromDb(row) : null;
  }

  async findByStudentId(studentId: string): Promise<StudentCodeRecord[]> {
    const rows = await this.db.query.studentCodes.findMany({
      where: eq(studentCodes.studentId, studentId),
      orderBy: [desc(studentCodes.issuedAt)],
    });
    return rows.map(mapStudentCodeFromDb);
  }

  async findActiveByStudentId(studentId: string): Promise<StudentCodeRecord | null> {
    const row = await this.db.query.studentCodes.findFirst({
      where: and(eq(studentCodes.studentId, studentId), eq(studentCodes.status, 'active')),
    });
    return row ? mapStudentCodeFromDb(row) : null;
  }

  async create(studentId: string, code: string, issuedBy?: string): Promise<StudentCodeRecord> {
    // Revoke any existing active codes first
    await this.revokeAllForStudent(studentId, 'New code issued');

    const rows = await this.db
      .insert(studentCodes)
      .values({
        id: crypto.randomUUID(),
        studentId,
        code,
        status: 'active',
        issuedAt: new Date(),
        issuedBy: issuedBy ?? null,
      })
      .returning();

    if (!rows[0]) {
      throw new Error('Failed to create student code');
    }

    return mapStudentCodeFromDb(rows[0]);
  }

  async revoke(id: string, reason: string): Promise<StudentCodeRecord> {
    const rows = await this.db
      .update(studentCodes)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        reason,
      })
      .where(eq(studentCodes.id, id))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Student code with ID ${id} not found`);
    }

    return mapStudentCodeFromDb(rows[0]);
  }

  async revokeAllForStudent(studentId: string, reason: string): Promise<void> {
    await this.db
      .update(studentCodes)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        reason,
      })
      .where(and(eq(studentCodes.studentId, studentId), eq(studentCodes.status, 'active')));
  }
}
