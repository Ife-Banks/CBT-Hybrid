import type { OutboxEventRecord } from '../domain/types';

/** Injection token for the outbox repository. */
export const OUTBOX_REPOSITORY = Symbol('OUTBOX_REPOSITORY');

/** Pending sync events (API spec section 15). */
export interface OutboxRepository {
  insert(event: OutboxEventRecord): Promise<void>;
}
