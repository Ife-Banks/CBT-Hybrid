import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, asc } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { DrizzleService } from '../../../shared/database/drizzle.service';
import { assets } from '@cbt/shared-types';
import type { AssetDomainRecord, CreateAssetDto } from '../domain/types';
import { mapAssetFromDb } from '../domain/mappers';
import type { AssetRepository } from './asset.repository';

@Injectable()
export class DrizzleAssetRepository implements AssetRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async findById(id: string): Promise<AssetDomainRecord | null> {
    const row = await this.db.query.assets.findFirst({
      where: eq(assets.id, id),
    });
    return row ? mapAssetFromDb(row) : null;
  }

  async findBySchoolId(schoolId: string): Promise<AssetDomainRecord[]> {
    const rows = await this.db.query.assets.findMany({
      where: eq(assets.schoolId, schoolId),
      orderBy: [asc(assets.createdAt)],
    });
    return rows.map(mapAssetFromDb);
  }

  async create(dto: CreateAssetDto, schoolId: string, uploadedBy: string): Promise<AssetDomainRecord> {
    const rows = await this.db
      .insert(assets)
      .values({
        id: crypto.randomUUID(),
        schoolId,
        type: dto.type,
        filename: dto.filename,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        storagePath: dto.storagePath,
        storageProvider: dto.storageProvider ?? 'local',
        uploadedBy,
      })
      .returning();

    if (!rows[0]) {
      throw new Error('Failed to create asset');
    }

    return mapAssetFromDb(rows[0]);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Asset with ID ${id} not found`);
    }

    await this.db.delete(assets).where(eq(assets.id, id));
  }
}
