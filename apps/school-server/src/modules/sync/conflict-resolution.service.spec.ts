import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConflictResolutionService } from './conflict-resolution.service';
import { DrizzleSyncConflictRepository } from './repositories/drizzle-conflict.repository';
import { DrizzleEntityVersionRepository } from './repositories/drizzle-entity-version.repository';
import { createInMemoryDb, type InMemoryDb } from './testing/in-memory-db';

type View = { name: string; klass: string };

describe('ConflictResolutionService', () => {
  let memo: InMemoryDb;
  let service: ConflictResolutionService;
  let conflicts: DrizzleSyncConflictRepository;
  let versions: DrizzleEntityVersionRepository;

  beforeEach(async () => {
    memo = await createInMemoryDb();
    conflicts = new DrizzleSyncConflictRepository(memo.service);
    versions = new DrizzleEntityVersionRepository(memo.service);
    service = new ConflictResolutionService(conflicts, versions);
  });

  afterEach(() => memo.close());

  it('adopts a remote-only change and settles the version vector', async () => {
    const out = await service.detectAndResolve<View>({
      schoolId: 'school-a',
      entityType: 'student',
      entityId: 's1',
      local: { name: 'Ada', klass: 'JSS1' },
      remote: { name: 'Ada', klass: 'JSS2' },
      localVersion: 1,
      remoteVersion: 2,
      baseVersion: 1,
    });

    expect(out.detected).toBe(false);
    expect(out.value).toEqual({ name: 'Ada', klass: 'JSS2' });
    expect(out.version).toMatchObject({ localVersion: 2, remoteVersion: 2, baseVersion: 2 });
    const stored = await versions.get('school-a', 'student', 's1');
    expect(stored?.baseVersion).toBe(2);
  });

  it('keeps a local-only change and marks the entity as locally changed', async () => {
    await service.detectAndResolve<View>({
      schoolId: 'school-a',
      entityType: 'student',
      entityId: 's1',
      local: { name: 'Ada Bello', klass: 'JSS1' },
      remote: { name: 'Ada', klass: 'JSS1' },
      localVersion: 2,
      remoteVersion: 1,
      baseVersion: 1,
    });

    const changed = await versions.listLocallyChanged('school-a', 'student');
    expect(changed.map((record) => record.entityId)).toEqual(['s1']);
  });

  it('auto-merges non-overlapping edits without opening a conflict', async () => {
    const out = await service.detectAndResolve<View>({
      schoolId: 'school-a',
      entityType: 'student',
      entityId: 's1',
      base: { name: 'Ada', klass: 'JSS1' },
      local: { name: 'Ada Bello', klass: 'JSS1' },
      remote: { name: 'Ada', klass: 'JSS2' },
      localVersion: 2,
      remoteVersion: 2,
      baseVersion: 1,
    });

    expect(out.detected).toBe(true);
    expect(out.resolved).toBe(true);
    expect(out.source).toBe('merged');
    expect(out.value).toEqual({ name: 'Ada Bello', klass: 'JSS2' });
    expect(await service.openCount('school-a')).toBe(0);
  });

  it('opens a conflict when the same field changed on both sides', async () => {
    const out = await service.detectAndResolve<View>({
      schoolId: 'school-a',
      entityType: 'student',
      entityId: 's1',
      base: { name: 'Ada', klass: 'JSS1' },
      local: { name: 'Ada Bello', klass: 'JSS1' },
      remote: { name: 'Ada Grace', klass: 'JSS1' },
      localVersion: 2,
      remoteVersion: 3,
      baseVersion: 1,
    });

    expect(out.detected).toBe(true);
    expect(out.resolved).toBe(false);
    expect(out.conflictFields).toEqual(['name']);
    expect(out.conflictId).toBeTruthy();
    expect(await service.openCount('school-a')).toBe(1);

    const open = await service.findOpen('school-a', 'student', 's1');
    expect(open?.localValue).toEqual({ name: 'Ada Bello', klass: 'JSS1' });
    expect(open?.remoteValue).toEqual({ name: 'Ada Grace', klass: 'JSS1' });
  });

  it('does not duplicate an open conflict when the same edit is seen again', async () => {
    const input = {
      schoolId: 'school-a',
      entityType: 'student' as const,
      entityId: 's1',
      base: { name: 'Ada', klass: 'JSS1' },
      local: { name: 'Ada Bello', klass: 'JSS1' },
      remote: { name: 'Ada Grace', klass: 'JSS1' },
      localVersion: 2,
      remoteVersion: 3,
      baseVersion: 1,
    };
    await service.detectAndResolve<View>(input);
    await service.detectAndResolve<View>(input);
    expect(await service.openCount('school-a')).toBe(1);
  });

  it('settles with local_wins and leaves the entity pending a push', async () => {
    const out = await service.detectAndResolve<View>({
      schoolId: 'school-a',
      entityType: 'student',
      entityId: 's1',
      base: { name: 'Ada', klass: 'JSS1' },
      local: { name: 'Ada Bello', klass: 'JSS1' },
      remote: { name: 'Ada Grace', klass: 'JSS1' },
      localVersion: 2,
      remoteVersion: 3,
      baseVersion: 1,
      strategy: 'local_wins',
    });

    expect(out.resolved).toBe(true);
    expect(out.value).toEqual({ name: 'Ada Bello', klass: 'JSS1' });
    expect(out.version.localVersion).toBe(4); // max(2,3) + 1
    expect(out.version.baseVersion).toBe(3);
  });

  it('settles with remote_wins and marks both sides agreed', async () => {
    const out = await service.detectAndResolve<View>({
      schoolId: 'school-a',
      entityType: 'student',
      entityId: 's1',
      base: { name: 'Ada', klass: 'JSS1' },
      local: { name: 'Ada Bello', klass: 'JSS1' },
      remote: { name: 'Ada Grace', klass: 'JSS1' },
      localVersion: 2,
      remoteVersion: 3,
      baseVersion: 1,
      strategy: 'remote_wins',
    });

    expect(out.value).toEqual({ name: 'Ada Grace', klass: 'JSS1' });
    expect(out.version.localVersion).toBe(3);
  });

  it('resolves an open conflict by id', async () => {
    const out = await service.detectAndResolve<View>({
      schoolId: 'school-a',
      entityType: 'student',
      entityId: 's1',
      base: { name: 'Ada', klass: 'JSS1' },
      local: { name: 'Ada Bello', klass: 'JSS1' },
      remote: { name: 'Ada Grace', klass: 'JSS1' },
      localVersion: 2,
      remoteVersion: 3,
      baseVersion: 1,
    });

    const resolved = await service.resolveById(out.conflictId!, 'remote_wins', 'admin');
    expect(resolved?.resolution).toBe('remote_wins');
    expect(resolved?.value).toEqual({ name: 'Ada Grace', klass: 'JSS1' });
    expect(await service.openCount('school-a')).toBe(0);

    // Resolving again is a no-op: the conflict is no longer open.
    expect(await service.resolveById(out.conflictId!, 'local_wins', 'admin')).toBeNull();
  });

  it('ignores an open conflict', async () => {
    const out = await service.detectAndResolve<View>({
      schoolId: 'school-a',
      entityType: 'student',
      entityId: 's1',
      base: null,
      local: { name: 'L', klass: 'JSS1' },
      remote: { name: 'R', klass: 'JSS1' },
      localVersion: 1,
      remoteVersion: 1,
      baseVersion: 0,
    });
    expect(await service.ignore(out.conflictId!)).toBe(true);
    expect(await service.openCount('school-a')).toBe(0);
  });
});
