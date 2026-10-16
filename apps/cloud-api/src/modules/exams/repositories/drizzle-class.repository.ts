import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { DrizzleService } from '../../../shared/database/drizzle.service';
import { classes } from '@cbt/shared-types';
import type { ClassRepository } from './class.repository';
import type { ClassDomainRecord, CreateClassDto } from '../domain/types';
import { mapClassToDomain } from '../domain/mappers';
import crypto from 'node:crypto';

@Injectable()
export class DrizzleClassRepository implements ClassRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async create(dto: CreateClassDto, schoolId: string): Promise<ClassDomainRecord> {
    const id = crypto.randomUUID();
    const rows = await this.db
      .insert(classes)
      .values({
        id,
        schoolId,
        name: dto.name,
        levelName: dto.levelName ?? null,
        section: dto.section,
      })
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to create class');
    }
    return mapClassToDomain(row);
  }

  async findById(id: string): Promise<ClassDomainRecord | null> {
    const [row] = await this.db.select().from(classes).where(eq(classes.id, id)).limit(1);
    return row ? mapClassToDomain(row) : null;
  }

  async findBySchoolId(schoolId: string): Promise<ClassDomainRecord[]> {
    const rows = await this.db.select().from(classes).where(eq(classes.schoolId, schoolId));
    return rows.map(mapClassToDomain);
  }

  async update(id: string, dto: Partial<CreateClassDto>): Promise<ClassDomainRecord> {
    const rows = await this.db
      .update(classes)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.levelName !== undefined && { levelName: dto.levelName ?? null }),
        ...(dto.section !== undefined && { section: dto.section }),
      })
      .where(eq(classes.id, id))
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to update class');
    }
    return mapClassToDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(classes).where(eq(classes.id, id));
  }
}
