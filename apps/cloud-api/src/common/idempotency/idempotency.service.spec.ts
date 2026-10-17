import { beforeEach, describe, expect, it } from 'vitest';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  let store: IdempotencyService;

  beforeEach(() => {
    store = new IdempotencyService();
  });

  it('returns a stored response for the same scope and key', () => {
    store.set('POST /results/release', 'key-1', {
      status: 201,
      body: { released: 2 },
      bodyHash: 'hash',
      createdAt: new Date(),
    });
    expect(store.get('POST /results/release', 'key-1')?.body).toEqual({ released: 2 });
  });

  it('scopes keys per route', () => {
    store.set('POST /results/release', 'key-1', {
      status: 201,
      body: { released: 2 },
      bodyHash: 'hash',
      createdAt: new Date(),
    });
    expect(store.get('POST /results/other', 'key-1')).toBeNull();
  });

  it('expires keys after 24 hours', () => {
    const created = new Date('2026-10-01T00:00:00Z');
    store.set('POST /x', 'key-1', { status: 201, body: {}, bodyHash: 'h', createdAt: created });
    expect(store.get('POST /x', 'key-1', new Date('2026-10-01T23:00:00Z'))).not.toBeNull();
    expect(store.get('POST /x', 'key-1', new Date('2026-10-02T01:00:00Z'))).toBeNull();
  });
});
