import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, asc } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { guardians } from '@cbt/shared-types';
import type { GuardianRecord, CreateGuardianDto, UpdateGuardianDto } from '../domain/types';
import { mapGuardianFromDb } from '../domain/mappers';

export interface GuardianRepository {
  findById(id: string): Promise<GuardianRecord | null>;
  findBySchoolId(schoolId: string): Promise<GuardianRecord[]>;
  findByUserId(userId: string): Promise<GuardianRecord | null>;
  findByPhone(schoolId: string, phoneE164: string): Promise<GuardianRecord | null>;
  create(dto: CreateGuardianDto, schoolId: string): Promise<GuardianRecord>;
  update(id: string, dto: UpdateGuardianDto): Promise<GuardianRecord>;
  delete(id: string): Promise<void>;
}

@Injectable()
export class DrizzleGuardianRepository implements GuardianRepository {
  constructor(private readonly db: DrizzleDB) {}

  async findById(id: string): Promise<GuardianRecord | null> {
    const row = await this.db.query.guardians.findFirst({
      where: eq(guardians.id, id),
    });
    return row ? mapGuardianFromDb(row) : null;
  }

  async findBySchoolId(schoolId: string): Promise<GuardianRecord[]> {
    const rows = await this.db.query.guardians.findMany({
      where: eq(guardians.schoolId, schoolId),
      orderBy: [asc(guardians.fullName)],
    });
    return rows.map(mapGuardianFromDb);
  }

  async findByUserId(userId: string): Promise<GuardianRecord | null> {
    const row = await this.db.query.guardians.findFirst({
      where: eq(guardians.userId, userId),
    });
    return row ? mapGuardianFromDb(row) : null;
  }

  async findByPhone(schoolId: string, phoneE164: string): Promise<GuardianRecord | null> {
    const row = await this.db.query.guardians.findFirst({
      where: and(eq(guardians.schoolId, schoolId), eq(guardians.phoneE164, phoneE164)),
    });
    return row ? mapGuardianFromDb(row) : null;
  }

  async create(dto: CreateGuardianDto, schoolId: string): Promise<GuardianRecord> {
    const rows = await this.db
      .insert(guardians)
      .values({
        id: crypto.randomUUID(),
        schoolId,
        fullName: dto.fullName,
        email: dto.email ?? null,
        phoneE164: dto.phoneE164 ?? null,
        relationship: dto.relationship ?? null,
      })
      .returning();

    if (!rows[0]) {
      throw new Error('Failed to create guardian');
    }

    return mapGuardianFromDb(rows[0]);
  }

  async update(id: string, dto: UpdateGuardianDto): Promise<GuardianRecord> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Guardian with ID ${id} not found`);
    }

    const rows = await this.db
      .update(guardians)
      .set({
        fullName: dto.fullName,
        email: dto.email ?? null,
        phoneE164: dto.phoneE164 ?? null,
        relationship: dto.relationship ?? null,
        updatedAt: new Date(),
      })
      .where(eq(guardians.id, id))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Guardian with ID ${id} not found after update`);
    }

    return mapGuardianFromDb(rows[0]);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(guardians).where(eq(guardians.id, id));
  }
}
