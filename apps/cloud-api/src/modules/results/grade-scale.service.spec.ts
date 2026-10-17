import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { GradeScaleService } from './grade-scale.service';
import { InMemoryGradeScaleRepository } from './repositories';
import { DEFAULT_GRADE_BANDS } from './domain/grading';

describe('GradeScaleService', () => {
  let repository: InMemoryGradeScaleRepository;
  let service: GradeScaleService;

  beforeEach(() => {
    repository = new InMemoryGradeScaleRepository();
    service = new GradeScaleService(repository);
  });

  it('creates a default A-F scale on first use', async () => {
    const scale = await service.ensureDefault('school-1');
    expect(scale.isDefault).toBe(true);
    expect(scale.bands).toEqual(DEFAULT_GRADE_BANDS);
    // Idempotent: a second call returns the same scale.
    const again = await service.ensureDefault('school-1');
    expect(again.id).toBe(scale.id);
  });

  it('grades percents with the school scale', async () => {
    await service.ensureDefault('school-1');
    expect(await service.gradeFor('school-1', 85)).toBe('A');
    expect(await service.gradeFor('school-1', 41)).toBe('E');
  });

  it('rejects bands that leave a gap', async () => {
    await expect(
      service.setDefaultBands('school-1', [
        { min: 60, max: 100, grade: 'A' },
        { min: 0, max: 50, grade: 'F' },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('replaces the default scale bands', async () => {
    await service.ensureDefault('school-1');
    const updated = await service.setDefaultBands('school-1', [
      { min: 50, max: 100, grade: 'P', remark: 'Pass' },
      { min: 0, max: 49, grade: 'F', remark: 'Fail' },
    ]);
    expect(updated.bands).toHaveLength(2);
    expect(await service.gradeFor('school-1', 75)).toBe('P');
    expect(await service.gradeFor('school-1', 20)).toBe('F');
  });

  it('keeps scales isolated per school', async () => {
    await service.ensureDefault('school-1');
    await service.ensureDefault('school-2');
    const scales = await service.list('school-1');
    expect(scales).toHaveLength(1);
    expect(scales[0]!.schoolId).toBe('school-1');
  });
});
