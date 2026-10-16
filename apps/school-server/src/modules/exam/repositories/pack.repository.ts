import type { PackRecord } from '../domain/types';

/** Injection token for the pack repository. */
export const PACK_REPOSITORY = Symbol('PACK_REPOSITORY');

/** Pack import metadata (CBT-Database-Architecture section 4.2, `packs`). */
export interface PackRepository {
  findById(id: string): Promise<PackRecord | null>;
  findByExamAndVersion(examId: string, version: number): Promise<PackRecord | null>;
  create(record: PackRecord): Promise<PackRecord>;
  setVerified(id: string, verified: boolean): Promise<void>;
}
