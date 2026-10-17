import { describe, expect, it } from 'vitest';
import type { MetaRepository } from '../exam/repositories/meta.repository';
import type { SyncStateRepository } from './repositories/sync-state.repository';
import { SyncScopeService } from './sync-scope.service';

class FakeMeta implements MetaRepository {
  readonly map = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
}

class FakeSyncState implements SyncStateRepository {
  readonly map = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
}

describe('SyncScopeService', () => {
  it('falls back to the local school id when none is provisioned', async () => {
    const service = new SyncScopeService(new FakeMeta(), new FakeSyncState());
    expect(await service.getSchoolId()).toBe('local');
  });

  it('namespaces keys by school id', async () => {
    const service = new SyncScopeService(new FakeMeta(), new FakeSyncState());
    expect(service.scopeKey('roster_cursor', 'school-a')).toBe('school:school-a:roster_cursor');
  });

  it('writes scoped state and reads it back', async () => {
    const meta = new FakeMeta();
    meta.map.set('school_id', 'school-a');
    const state = new FakeSyncState();
    const service = new SyncScopeService(meta, state);

    await service.setState('roster_cursor', 'cursor-1');

    expect(state.map.get('school:school-a:roster_cursor')).toBe('cursor-1');
    expect(state.map.has('roster_cursor')).toBe(false);
    expect(await service.getState('roster_cursor')).toBe('cursor-1');
  });

  it('migrates a legacy unscoped key into school scope', async () => {
    const meta = new FakeMeta();
    meta.map.set('school_id', 'school-a');
    const state = new FakeSyncState();
    state.map.set('roster_cursor', 'legacy-cursor');
    const service = new SyncScopeService(meta, state);

    expect(await service.getState('roster_cursor')).toBe('legacy-cursor');
    expect(state.map.get('school:school-a:roster_cursor')).toBe('legacy-cursor');
  });

  it('isolates state between schools', async () => {
    const meta = new FakeMeta();
    const state = new FakeSyncState();

    meta.map.set('school_id', 'school-a');
    const a = new SyncScopeService(meta, state);
    await a.setState('pack_cursor', 'a-cursor');

    meta.map.set('school_id', 'school-b');
    const b = new SyncScopeService(meta, state);
    expect(await b.getState('pack_cursor')).toBeNull();
    await b.setState('pack_cursor', 'b-cursor');

    expect(state.map.get('school:school-a:pack_cursor')).toBe('a-cursor');
    expect(state.map.get('school:school-b:pack_cursor')).toBe('b-cursor');
  });

  it('detects a school change so cursors can be reset', async () => {
    const meta = new FakeMeta();
    meta.map.set('school_id', 'school-a');
    const service = new SyncScopeService(meta, new FakeSyncState());

    expect(await service.getSchoolId()).toBe('school-a');
    expect(await service.detectSchoolChange('school-a')).toBeNull();

    meta.map.set('school_id', 'school-b');
    service.clearCache();
    expect(await service.detectSchoolChange('school-a')).toBe('school-b');
  });
});
