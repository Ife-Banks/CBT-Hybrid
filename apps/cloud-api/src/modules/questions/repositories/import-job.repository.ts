import type { ImportJobDomainRecord, CreateImportJobDto, UpdateImportJobDto } from '../domain/types';

export interface ImportJobRepository {
  findById(id: string): Promise<ImportJobDomainRecord | null>;
  findBySchoolId(schoolId: string): Promise<ImportJobDomainRecord[]>;
  create(dto: CreateImportJobDto, schoolId: string, uploadedBy: string): Promise<ImportJobDomainRecord>;
  update(id: string, dto: UpdateImportJobDto): Promise<ImportJobDomainRecord>;
  delete(id: string): Promise<void>;
}
