import { Injectable } from '@nestjs/common';
import type { GradeBand, GradeScaleRecord } from '../domain/types';

/** Injection token for {@link GradeScaleRepository}. */
export const GRADE_SCALE_REPOSITORY = Symbol('GRADE_SCALE_REPOSITORY');

export interface CreateGradeScaleInput {
  id?: string;
  schoolId: string;
  name: string;
  bands: GradeBand[];
  isDefault?: boolean;
}

export interface UpdateGradeScaleInput {
  name?: string;
  bands?: GradeBand[];
  isDefault?: boolean;
}

/** Persistence port for grade scales (BR-18). */
export interface GradeScaleRepository {
  findById(id: string): Promise<GradeScaleRecord | null>;
  findDefaultForSchool(schoolId: string): Promise<GradeScaleRecord | null>;
  listBySchool(schoolId: string): Promise<GradeScaleRecord[]>;
  create(input: CreateGradeScaleInput): Promise<GradeScaleRecord>;
  update(id: string, input: UpdateGradeScaleInput): Promise<GradeScaleRecord>;
}

@Injectable()
export class InMemoryGradeScaleRepository implements GradeScaleRepository {
  private readonly scales = new Map<string, GradeScaleRecord>();
  private counter = 0;

  async findById(id: string): Promise<GradeScaleRecord | null> {
    const found = this.scales.get(id);
    return found ? clone(found) : null;
  }

  async findDefaultForSchool(schoolId: string): Promise<GradeScaleRecord | null> {
    for (const scale of this.scales.values()) {
      if (scale.schoolId === schoolId && scale.isDefault) return clone(scale);
    }
    return null;
  }

  async listBySchool(schoolId: string): Promise<GradeScaleRecord[]> {
    return [...this.scales.values()]
      .filter((scale) => scale.schoolId === schoolId)
      .map(clone);
  }

  async create(input: CreateGradeScaleInput): Promise<GradeScaleRecord> {
    this.counter += 1;
    const now = new Date();
    const record: GradeScaleRecord = {
      id: input.id ?? `scale-${this.counter}`,
      schoolId: input.schoolId,
      name: input.name,
      bands: [...input.bands],
      isDefault: input.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    };
    if (record.isDefault) this.clearDefault(record.schoolId);
    this.scales.set(record.id, record);
    return clone(record);
  }

  async update(id: string, input: UpdateGradeScaleInput): Promise<GradeScaleRecord> {
    const existing = this.scales.get(id);
    if (!existing) throw new Error(`grade scale ${id} not found`);
    if (input.isDefault) this.clearDefault(existing.schoolId);
    const updated: GradeScaleRecord = {
      ...existing,
      name: input.name ?? existing.name,
      bands: input.bands ? [...input.bands] : existing.bands,
      isDefault: input.isDefault ?? existing.isDefault,
      updatedAt: new Date(),
    };
    this.scales.set(id, updated);
    return clone(updated);
  }

  clear(): void {
    this.scales.clear();
    this.counter = 0;
  }

  private clearDefault(schoolId: string): void {
    for (const [key, scale] of this.scales.entries()) {
      if (scale.schoolId === schoolId && scale.isDefault) {
        this.scales.set(key, { ...scale, isDefault: false });
      }
    }
  }
}

function clone(scale: GradeScaleRecord): GradeScaleRecord {
  return { ...scale, bands: scale.bands.map((band) => ({ ...band })) };
}
