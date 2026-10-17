import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DEFAULT_GRADE_BANDS, gradeForPercent, validateGradeBands } from './domain/grading';
import type { GradeBand, GradeScaleRecord } from './domain/types';
import { GRADE_SCALE_REPOSITORY, type GradeScaleRepository } from './repositories';

/**
 * Owns the school's grade scale (BR-18, settings contract 11.3). Every school
 * gets the default A-F scale on first use; bands must cover 0..100 exactly.
 */
@Injectable()
export class GradeScaleService {
  constructor(
    @Inject(GRADE_SCALE_REPOSITORY) private readonly scales: GradeScaleRepository,
  ) {}

  /** The school's default scale, created on first use. */
  async ensureDefault(schoolId: string): Promise<GradeScaleRecord> {
    const existing = await this.scales.findDefaultForSchool(schoolId);
    if (existing) return existing;
    return this.scales.create({
      schoolId,
      name: 'Default',
      bands: DEFAULT_GRADE_BANDS.map((band) => ({ ...band })),
      isDefault: true,
    });
  }

  async list(schoolId: string): Promise<GradeScaleRecord[]> {
    await this.ensureDefault(schoolId);
    return this.scales.listBySchool(schoolId);
  }

  /** Replace the default scale's bands (PUT /grade-scale). */
  async setDefaultBands(
    schoolId: string,
    bands: GradeBand[],
    name?: string,
  ): Promise<GradeScaleRecord> {
    const validation = validateGradeBands(bands);
    if (!validation.valid) {
      throw new BadRequestException({
        code: 'INVALID_GRADE_BANDS',
        message: 'Grade bands must cover 0 to 100 without gaps or overlap',
        errors: validation.errors,
      });
    }
    const existing = await this.scales.findDefaultForSchool(schoolId);
    if (existing) {
      return this.scales.update(existing.id, { bands, ...(name && { name }) });
    }
    return this.scales.create({ schoolId, name: name ?? 'Default', bands, isDefault: true });
  }

  /** The grade letter for a percent using the school's scale. */
  async gradeFor(schoolId: string, percent: number): Promise<string | null> {
    const scale = await this.ensureDefault(schoolId);
    return gradeForPercent(percent, scale.bands);
  }
}
