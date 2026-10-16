import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, asc } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { DrizzleService } from '../../../shared/database/drizzle.service';
import { importJobs } from '@cbt/shared-types';
import type { ImportJobDomainRecord, CreateImportJobDto, UpdateImportJobDto } from '../domain/types';
import { mapImportJobFromDb } from '../domain/mappers';
import type { ImportJobRepository } from './import-job.repository';

@Injectable()
export class DrizzleImportJobRepository implements ImportJobRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async findById(id: string): Promise<ImportJobDomainRecord | null> {
    const row = await this.db.query.importJobs.findFirst({
      where: eq(importJobs.id, id),
    });
    return row ? mapImportJobFromDb(row) : null;
  }

  async findBySchoolId(schoolId: string): Promise<ImportJobDomainRecord[]> {
    const rows = await this.db.query.importJobs.findMany({
      where: eq(importJobs.schoolId, schoolId),
      orderBy: [asc(importJobs.createdAt)],
    });
    return rows.map(mapImportJobFromDb);
  }

  async create(dto: CreateImportJobDto, schoolId: string, uploadedBy: string): Promise<ImportJobDomainRecord> {
    const rows = await this.db
      .insert(importJobs)
      .values({
        id: crypto.randomUUID(),
        schoolId,
        kind: dto.kind,
        status: 'pending',
        fileAssetId: dto.fileAssetId,
        uploadedBy,
        totalRows: 0,
        processedRows: 0,
        succeededRows: 0,
        failedRows: 0,
      })
      .returning();

    if (!rows[0]) {
      throw new Error('Failed to create import job');
    }

    return mapImportJobFromDb(rows[0]);
  }

  async update(id: string, dto: UpdateImportJobDto): Promise<ImportJobDomainRecord> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Import job with ID ${id} not found`);
    }

    const rows = await this.db
      .update(importJobs)
      .set({
        status: dto.status,
        totalRows: dto.totalRows,
        processedRows: dto.processedRows,
        succeededRows: dto.succeededRows,
        failedRows: dto.failedRows,
        errorSummary: dto.errorSummary ? (dto.errorSummary as any) : null,
        startedAt: dto.startedAt,
        completedAt: dto.completedAt,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, id))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Import job with ID ${id} not found after update`);
    }

    return mapImportJobFromDb(rows[0]);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Import job with ID ${id} not found`);
    }

    await this.db.delete(importJobs).where(eq(importJobs.id, id));
  }
}
