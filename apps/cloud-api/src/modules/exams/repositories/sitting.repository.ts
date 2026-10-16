import type { SittingDomainRecord, CreateSittingDto, UpdateSittingDto } from '../domain/types';

export interface SittingRepository {
  create(dto: CreateSittingDto, schoolId: string): Promise<SittingDomainRecord>;
  findById(id: string): Promise<SittingDomainRecord | null>;
  findBySchoolId(schoolId: string): Promise<SittingDomainRecord[]>;
  findByExamId(examId: string): Promise<SittingDomainRecord[]>;
  findByClassId(classId: string): Promise<SittingDomainRecord[]>;
  update(id: string, dto: UpdateSittingDto): Promise<SittingDomainRecord>;
  delete(id: string): Promise<void>;
}
