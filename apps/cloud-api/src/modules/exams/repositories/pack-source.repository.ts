import type { PackSourceBundle } from '../domain/types';

/**
 * Reads everything a pack needs (questions, options, questions' assets and the
 * subject) for one exam. Kept separate from the exam repository so the pack
 * service depends only on the data it actually uses.
 */
export interface PackSourceRepository {
  gather(examId: string): Promise<PackSourceBundle | null>;
}
