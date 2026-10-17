import type { OutboxEventRecord } from '../domain/types';

/** Injection token for the outbox repository. */
export const OUTBOX_REPOSITORY = Symbol('OUTBOX_REPOSITORY');

/** Pending sync events (API spec section 15). */
export interface OutboxRepository {
  insert(event: OutboxEventRecord): Promise<void>;

  /** List pending events that are ready for retry. */
  listPending(now: string): Promise<OutboxEventRecord[]>;

  /** Count pending events that are ready for retry. */
  countPending(now?: string): Promise<number>;

  /** Mark events as acknowledged by the cloud. */
  acknowledge(eventIds: string[], ackedAt: string): Promise<void>;

  /** Increment attempt count and set next retry time. */
  incrementAttempts(eventIds: string[], nextAttemptAt: string, errorMsg: string): Promise<void>;
}
