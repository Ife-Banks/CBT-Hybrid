import { Injectable } from '@nestjs/common';

/** A stored response for an idempotency key (API spec 1.6). */
export interface IdempotencyRecord {
  status: number;
  body: unknown;
  /** SHA-256 of the request body, used to detect a key reused with a new body. */
  bodyHash: string;
  createdAt: Date;
}

/** Keys live for 24 hours (API spec 1.6). */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * In-memory idempotency store. A `POST` that carries an `Idempotency-Key`
 * replays the first response for the same key and body for 24 hours; a key
 * reused with a different body is rejected. The durable version of this store
 * arrives with the production transport; the replay contract is identical.
 */
@Injectable()
export class IdempotencyService {
  private readonly records = new Map<string, IdempotencyRecord>();

  get(scope: string, key: string, now = new Date()): IdempotencyRecord | null {
    const record = this.records.get(entryKey(scope, key));
    if (!record) return null;
    if (now.getTime() - record.createdAt.getTime() > IDEMPOTENCY_TTL_MS) {
      this.records.delete(entryKey(scope, key));
      return null;
    }
    return record;
  }

  set(scope: string, key: string, record: IdempotencyRecord): void {
    this.records.set(entryKey(scope, key), record);
  }

  clear(): void {
    this.records.clear();
  }
}

function entryKey(scope: string, key: string): string {
  return `${scope}::${key}`;
}
