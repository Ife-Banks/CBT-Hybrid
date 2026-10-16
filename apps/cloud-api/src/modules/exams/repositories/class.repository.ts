import type { ClassDomainRecord, CreateClassDto } from '../domain/types';

export interface ClassRepository {
  create(dto: CreateClassDto, schoolId: string): Promise<ClassDomainRecord>;
  findById(id: string): Promise<ClassDomainRecord | null>;
  findBySchoolId(schoolId: string): Promise<ClassDomainRecord[]>;
  update(id: string, dto: Partial<CreateClassDto>): Promise<ClassDomainRecord>;
  delete(id: string): Promise<void>;
}
