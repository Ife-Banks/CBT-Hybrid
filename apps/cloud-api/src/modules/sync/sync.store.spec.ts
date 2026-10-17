import { beforeEach, describe, expect, it } from 'vitest';
import { CloudSyncStore } from './sync.store';

describe('CloudSyncStore', () => {
  let store: CloudSyncStore;

  beforeEach(() => {
    store = new CloudSyncStore();
  });

  it('bumps the version and assigns a cursor on each roster write', () => {
    const first = store.upsertRoster({ id: 'st-1', fullName: 'Ada' }, '2026-01-01T00:00:00.000Z');
    expect(first.version).toBe(1);

    const second = store.upsertRoster({ id: 'st-1', fullName: 'Ada Bello' }, '2026-01-02T00:00:00.000Z');
    expect(second.version).toBe(2);
    expect(second.updated_at).toBe('2026-01-02T00:00:00.000Z');
    expect(second.fullName).toBe('Ada Bello');
  });

  it('returns only records changed after the cursor', () => {
    store.upsertRoster({ id: 'st-1' }, '2026-01-01T00:00:00.000Z');
    const afterFirst = store.rosterSince();
    expect(afterFirst.students).toHaveLength(1);
    expect(afterFirst.cursor).toBe('1');

    store.upsertRoster({ id: 'st-2' }, '2026-01-02T00:00:00.000Z');
    const delta = store.rosterSince(afterFirst.cursor);
    expect(delta.students.map((student) => student.id)).toEqual(['st-2']);
    expect(delta.cursor).toBe('2');

    // Nothing new since the latest cursor.
    expect(store.rosterSince(delta.cursor).students).toHaveLength(0);
  });

  it('does not expose the internal sequence in the payload', () => {
    const record = store.upsertRoster({ id: 'st-1' });
    expect(record).not.toHaveProperty('seq');
  });

  it('tracks pack deltas independently', () => {
    store.upsertPack({ pack_id: 'pack-1', pack_key: 'key', pack_bytes: 'bytes' });
    const delta = store.packsSince();
    expect(delta.packs).toHaveLength(1);
    expect(delta.packs[0]?.version).toBe(1);
    expect(store.packsSince(delta.cursor).packs).toHaveLength(0);
  });

  it('accepts events with an id and rejects those without', () => {
    const result = store.receiveEvents('result.scored', [
      { event_id: 'ev-1' },
      { event_id: 'ev-2' },
      { payload: 'no id' },
    ]);
    expect(result.accepted).toEqual(['ev-1', 'ev-2']);
    expect(result.rejected).toHaveLength(1);
  });
});
