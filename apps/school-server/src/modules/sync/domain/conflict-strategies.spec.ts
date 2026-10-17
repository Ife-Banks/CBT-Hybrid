import { describe, expect, it } from 'vitest';
import {
  deepEqual,
  hasChanged,
  isConflictStrategy,
  isConflicted,
  resolveConflict,
  threeWayMerge,
} from './conflict-strategies';

describe('conflict-strategies', () => {
  describe('deepEqual', () => {
    it('ignores key order', () => {
      expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    });

    it('compares nested arrays and objects', () => {
      expect(deepEqual([{ a: 1 }], [{ a: 1 }])).toBe(true);
      expect(deepEqual([1, 2], [2, 1])).toBe(false);
    });

    it('distinguishes null from missing', () => {
      expect(deepEqual(null, undefined)).toBe(false);
      expect(deepEqual(null, null)).toBe(true);
    });
  });

  describe('change detection', () => {
    it('reports a change only past the base version', () => {
      expect(hasChanged(2, 1)).toBe(true);
      expect(hasChanged(1, 1)).toBe(false);
    });

    it('flags a conflict only when both sides moved', () => {
      expect(isConflicted(2, 2, 1)).toBe(true);
      expect(isConflicted(2, 1, 1)).toBe(false);
      expect(isConflicted(1, 2, 1)).toBe(false);
      expect(isConflicted(1, 1, 1)).toBe(false);
    });
  });

  describe('threeWayMerge', () => {
    it('auto-merges changes made on opposite sides', () => {
      const result = threeWayMerge(
        { a: 1, b: 2, c: 3 },
        { a: 1, b: 20, c: 3 },
        { a: 1, b: 2, c: 30 },
      );
      expect(result.merged).toEqual({ a: 1, b: 20, c: 30 });
      expect(result.autoMerged.sort()).toEqual(['b', 'c']);
      expect(result.conflicts).toEqual([]);
    });

    it('flags fields changed on both sides and keeps the local value', () => {
      const result = threeWayMerge(
        { a: 1, b: 2 },
        { a: 1, b: 99 },
        { a: 1, b: 42 },
      );
      expect(result.merged).toEqual({ a: 1, b: 99 });
      expect(result.conflicts).toEqual(['b']);
      expect(result.autoMerged).toEqual([]);
    });

    it('handles a missing base by treating every difference as a conflict', () => {
      const result = threeWayMerge(null, { a: 1 }, { a: 2 });
      expect(result.conflicts).toEqual(['a']);
    });

    it('takes the changed side when the other matches the base', () => {
      const result = threeWayMerge({ a: 1 }, { a: 1 }, { a: 5 });
      expect(result.merged).toEqual({ a: 5 });
      expect(result.autoMerged).toEqual(['a']);
    });
  });

  describe('resolveConflict', () => {
    const base = { name: 'Ada', klass: 'JSS1' };
    const local = { name: 'Ada Bello', klass: 'JSS1' };
    const remote = { name: 'Ada Grace', klass: 'JSS2' };
    const common = {
      base,
      local,
      remote,
      localVersion: 2,
      remoteVersion: 3,
      baseVersion: 1,
      localUpdatedAt: '2026-01-01T00:00:00.000Z',
      remoteUpdatedAt: '2026-02-01T00:00:00.000Z',
    };

    it('local_wins keeps the local copy', () => {
      const out = resolveConflict({ ...common, strategy: 'local_wins' });
      expect(out.value).toEqual(local);
      expect(out.resolution).toBe('local_wins');
      expect(out.resolved).toBe(true);
    });

    it('remote_wins takes the remote copy', () => {
      const out = resolveConflict({ ...common, strategy: 'remote_wins' });
      expect(out.value).toEqual(remote);
      expect(out.resolution).toBe('remote_wins');
    });

    it('newest_wins uses the newer timestamp', () => {
      const out = resolveConflict({ ...common, strategy: 'newest_wins' });
      expect(out.value).toEqual(remote);
      expect(out.resolution).toBe('remote_wins');
    });

    it('newest_wins favours local on a tie', () => {
      const out = resolveConflict({
        ...common,
        remoteUpdatedAt: common.localUpdatedAt,
        strategy: 'newest_wins',
      });
      expect(out.value).toEqual(local);
      expect(out.resolution).toBe('local_wins');
    });

    it('merge resolves when no field conflicts remain', () => {
      const out = resolveConflict({
        base,
        local: { name: 'Ada Bello', klass: 'JSS1' },
        remote: { name: 'Ada', klass: 'JSS2' },
        localVersion: 2,
        remoteVersion: 3,
        baseVersion: 1,
        strategy: 'merge',
      });
      expect(out.resolved).toBe(true);
      expect(out.resolution).toBe('merged');
      expect(out.value).toEqual({ name: 'Ada Bello', klass: 'JSS2' });
    });

    it('merge stays unresolved when a field changed on both sides', () => {
      const out = resolveConflict({ ...common, strategy: 'merge' });
      expect(out.resolved).toBe(false);
      expect(out.resolution).toBeNull();
      expect(out.conflictFields).toEqual(['name']);
    });

    it('manual never resolves automatically', () => {
      const out = resolveConflict({ ...common, strategy: 'manual' });
      expect(out.resolved).toBe(false);
      expect(out.resolution).toBeNull();
    });
  });

  describe('isConflictStrategy', () => {
    it('accepts the known strategies and rejects anything else', () => {
      expect(isConflictStrategy('merge')).toBe(true);
      expect(isConflictStrategy('newest_wins')).toBe(true);
      expect(isConflictStrategy('bogus')).toBe(false);
    });
  });
});
