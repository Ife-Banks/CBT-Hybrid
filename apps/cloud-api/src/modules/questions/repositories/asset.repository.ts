import type { AssetDomainRecord, CreateAssetDto, UpdateAssetDto } from '../domain/types';

export interface AssetRepository {
  findById(id: string): Promise<AssetDomainRecord | null>;
  findBySchoolId(schoolId: string): Promise<AssetDomainRecord[]>;
  create(dto: CreateAssetDto, schoolId: string, uploadedBy: string): Promise<AssetDomainRecord>;
  delete(id: string): Promise<void>;
}
