import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { eq, asc } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { DrizzleService } from '../../../shared/database/drizzle.service';
import { levels } from '@cbt/shared-types';
import type { LevelDomainRecord, CreateLevelDto, UpdateLevelDto } from '../domain/types';
import { mapLevelFromDb } from '../domain/mappers';
import type { LevelRepository } from './level.repository';

@Injectable()
export class DrizzleLevelRepository implements LevelRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async findById(id: string): Promise<LevelDomainRecord | null> {
    const row = await this.db.query.levels.findFirst({
      where: eq(levels.id, id),
    });
    return row ? mapLevelFromDb(row) : null;
  }

  async findBySchoolId(schoolId: string): Promise<LevelDomainRecord[]> {
    const rows = await this.db.query.levels.findMany({
      where: eq(levels.schoolId, schoolId),
      orderBy: [asc(levels.section), asc(levels.sortOrder)],
    });
    return rows.map(mapLevelFromDb);
  }

  async findByName(schoolId: string, name: string): Promise<LevelDomainRecord | null> {
    const row = await this.db.query.levels.findFirst({
      where: eq(levels.schoolId, schoolId),
    });

    if (!row) return null;

    const allLevels = await this.findBySchoolId(schoolId);
    return allLevels.find((l) => l.name === name) ?? null;
  }

  async create(dto: CreateLevelDto, schoolId: string): Promise<LevelDomainRecord> {
    const existing = await this.findByName(schoolId, dto.name);
    if (existing) {
      throw new ConflictException(`Level with name "${dto.name}" already exists`);
    }

    const rows = await this.db
      .insert(levels)
      .values({
        id: crypto.randomUUID(),
        schoolId,
        name: dto.name,
        section: dto.section ?? null,
        sortOrder: dto.sortOrder,
      })
      .returning();

    if (!rows[0]) {
      throw new Error('Failed to create level');
    }

    return mapLevelFromDb(rows[0]);
  }

  async update(id: string, dto: UpdateLevelDto): Promise<LevelDomainRecord> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Level with ID ${id} not found`);
    }

    const rows = await this.db
      .update(levels)
      .set({
        name: dto.name,
        section: dto.section ?? null,
        sortOrder: dto.sortOrder,
      })
      .where(eq(levels.id, id))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Level with ID ${id} not found after update`);
    }

    return mapLevelFromDb(rows[0]);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Level with ID ${id} not found`);
    }

    await this.db.delete(levels).where(eq(levels.id, id));
  }
}
