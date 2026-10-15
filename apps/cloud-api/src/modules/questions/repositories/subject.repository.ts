import type { SubjectDomainRecord, CreateSubjectDto, UpdateSubjectDto } from '../domain/types';

export interface SubjectRepository {
  findById(id: string): Promise<SubjectDomainRecord | null>;
  findBySchoolId(schoolId: string): Promise<SubjectDomainRecord[]>;
  findByName(schoolId: string, name: string): Promise<SubjectDomainRecord | null>;
  create(dto: CreateSubjectDto, schoolId: string): Promise<SubjectDomainRecord>;
  update(id: string, dto: UpdateSubjectDto): Promise<SubjectDomainRecord>;
  delete(id: string): Promise<void>;
}
