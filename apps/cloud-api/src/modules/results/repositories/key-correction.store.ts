import { Injectable } from '@nestjs/common';
import type { RemarkCorrection } from '../domain/types';

/** Injection token for {@link KeyCorrectionStore}. */
export const KEY_CORRECTION_STORE = Symbol('KEY_CORRECTION_STORE');

export interface ApplyQuestionCorrectionInput {
  schoolId: string;
  examId: string;
  questionId: string;
  actorId: string;
  reason: string;
  correction: RemarkCorrection;
}

export interface ApplyQuestionCorrectionResult {
  /** The newly approved question version that replaced the original. */
  newQuestionId: string;
  /** The bumped key version for the exam. */
  newKeyVersion: number;
}

/**
 * BR-12: a key correction never edits an approved question. On apply the caller
 * creates a corrected, approved question version, swaps it into the exam, and
 * bumps the exam's key version — in one transaction — so school servers pick the
 * new key up at the next sync.
 */
export interface KeyCorrectionStore {
  applyCorrection(input: ApplyQuestionCorrectionInput): Promise<ApplyQuestionCorrectionResult>;
}

/**
 * In-memory stand-in for the versioning store. The cloud never has a database in
 * local runs, so this records the correction and hands back a synthetic new
 * question id plus the next key version. The real writes live in
 * {@link DrizzleKeyCorrectionStore}.
 */
@Injectable()
export class InMemoryKeyCorrectionStore implements KeyCorrectionStore {
  private counter = 0;
  private readonly keyVersions = new Map<string, number>();
  private readonly applied: ApplyQuestionCorrectionResult[] = [];

  async applyCorrection(input: ApplyQuestionCorrectionInput): Promise<ApplyQuestionCorrectionResult> {
    this.counter += 1;
    const newKeyVersion = (this.keyVersions.get(input.examId) ?? 1) + 1;
    this.keyVersions.set(input.examId, newKeyVersion);
    const result: ApplyQuestionCorrectionResult = {
      newQuestionId: `question-version-${this.counter}`,
      newKeyVersion,
    };
    this.applied.push(result);
    return { ...result };
  }

  /** Corrections applied in order, for tests and diagnostics. */
  list(): readonly ApplyQuestionCorrectionResult[] {
    return this.applied;
  }

  clear(): void {
    this.counter = 0;
    this.keyVersions.clear();
    this.applied.length = 0;
  }
}
