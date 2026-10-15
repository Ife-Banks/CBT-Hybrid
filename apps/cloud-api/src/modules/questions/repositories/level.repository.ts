import type { LevelDomainRecord, CreateLevelDto, UpdateLevelDto } from '../domain/types';

export interface LevelRepository {
  findById(id: string): Promise<LevelDomainRecord | null>;
  findBySchoolId(schoolId: string): Promise<LevelDomainRecord[]>;
  findByName(schoolId: string, name: string): Promise<LevelDomainRecord | null>;
  create(dto: CreateLevelDto, schoolId: string): Promise<LevelDomainRecord>;
  update(id: string, dto: UpdateLevelDto): Promise<LevelDomainRecord>;
  delete(id: string): Promise<void>;
}
