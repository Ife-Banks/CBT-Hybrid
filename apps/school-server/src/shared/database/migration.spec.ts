import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { eq, sql } from 'drizzle-orm';
import * as schema from './schema';

describe('SQLite Migration Tests', () => {
  const testDbPath = './test-data/test-school.db';

  afterEach(() => {
    if (existsSync(testDbPath)) {
      try {
        rmSync(testDbPath);
      } catch (error) {
        // Ignore permission errors - the file may be locked by SQLite
        console.warn('Could not remove test database file:', error);
      }
    }
  });

  it('should have migration files generated', () => {
    const migrationsDir = './src/shared/database/migrations';
    expect(existsSync(migrationsDir)).toBe(true);
  });

  it('should run migrations successfully on SQLite', async () => {
    mkdirSync('./test-data', { recursive: true });

    const sqlite = new Database(testDbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = FULL');
    sqlite.pragma('foreign_keys = ON');

    const db = drizzle(sqlite, { schema });

    await migrate(db, { migrationsFolder: './src/shared/database/migrations' });

    // Verify tables exist by querying them
    const schools = db.select().from(schema.schools).all();
    expect(Array.isArray(schools)).toBe(true);

    const users = db.select().from(schema.users).all();
    expect(Array.isArray(users)).toBe(true);

    sqlite.close();
  });

  it('creates the exam-delivery tables from CBT-Database-Architecture 4.2', async () => {
    mkdirSync('./test-data', { recursive: true });

    const sqlite = new Database(testDbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite, { schema });

    await migrate(db, { migrationsFolder: './src/shared/database/migrations' });

    // Every exam-delivery table is queryable.
    for (const table of [
      schema.meta,
      schema.classes,
      schema.subjects,
      schema.students,
      schema.exams,
      schema.packs,
      schema.sittings,
      schema.seats,
      schema.examSessions,
      schema.answers,
      schema.results,
      schema.outbox,
      schema.syncState,
      schema.auditLog,
      schema.backupLog,
    ]) {
      expect(() => db.select().from(table).all()).not.toThrow();
    }

    // The staff sign-in table was renamed, and `sessions` now holds exam sessions.
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toContain('auth_sessions');
    expect(tables).toContain('sessions');

    const sessionColumns = sqlite
      .prepare('PRAGMA table_info(sessions)')
      .all()
      .map((row) => (row as { name: string }).name);
    expect(sessionColumns).toContain('seed');
    expect(sessionColumns).toContain('sitting_id');
    expect(sessionColumns).not.toContain('user_id');

    sqlite.close();
  });

  it('ignores answer writes that try to roll the sequence back', async () => {
    mkdirSync('./test-data', { recursive: true });

    const sqlite = new Database(testDbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite, { schema });

    await migrate(db, { migrationsFolder: './src/shared/database/migrations' });

    db.insert(schema.classes).values({ id: 'c1', name: 'JSS 2', section: 'secondary' }).run();
    db.insert(schema.subjects).values({ id: 's1', name: 'Mathematics' }).run();
    db.insert(schema.exams)
      .values({
        id: 'e1',
        title: 'Maths',
        subjectId: 's1',
        durationMin: 60,
        settingsJson: '{}',
        syncedAt: '2026-10-20T00:00:00.000Z',
      })
      .run();
    db.insert(schema.students)
      .values({
        id: 'st1',
        code: 'GRC23456789',
        codeStatus: 'active',
        fullName: 'Ada',
        classId: 'c1',
        section: 'secondary',
        syncedAt: '2026-10-20T00:00:00.000Z',
      })
      .run();
    db.insert(schema.packs)
      .values({
        id: 'p1',
        examId: 'e1',
        version: 1,
        keyVersion: 1,
        dirPath: 'active/p1',
        sha256: 'a'.repeat(64),
        downloadedAt: '2026-10-20T00:00:00.000Z',
      })
      .run();
    db.insert(schema.sittings)
      .values({
        id: 'sit1',
        examId: 'e1',
        classId: 'c1',
        packId: 'p1',
        windowStart: '2026-10-20T08:00:00.000Z',
        windowEnd: '2026-10-20T10:00:00.000Z',
        syncedAt: '2026-10-20T00:00:00.000Z',
      })
      .run();
    db.insert(schema.examSessions)
      .values({
        id: 'sess1',
        sittingId: 'sit1',
        studentId: 'st1',
        tokenHash: 'hash',
        seed: 42,
        startedAt: '2026-10-20T08:00:00.000Z',
        endsAt: '2026-10-20T09:00:00.000Z',
      })
      .run();
    db.insert(schema.answers)
      .values({
        sessionId: 'sess1',
        questionId: 'q1',
        answerJson: '{"option_id":"o1"}',
        seq: 5,
        savedAt: '2026-10-20T08:01:00.000Z',
      })
      .run();

    // A stale auto-save (lower seq) must be ignored by the trigger.
    db.update(schema.answers)
      .set({ answerJson: '{"option_id":"o2"}', seq: 3 })
      .where(eq(schema.answers.sessionId, 'sess1'))
      .run();

    const [stale] = db.select().from(schema.answers).all();
    expect(stale?.answerJson).toBe('{"option_id":"o1"}');
    expect(stale?.seq).toBe(5);

    // A newer auto-save applies.
    db.update(schema.answers)
      .set({ answerJson: '{"option_id":"o2"}', seq: 6 })
      .where(eq(schema.answers.sessionId, 'sess1'))
      .run();

    const [fresh] = db.select().from(schema.answers).all();
    expect(fresh?.answerJson).toBe('{"option_id":"o2"}');
    expect(fresh?.seq).toBe(6);

    // The section CHECK constraint rejects values outside the enum.
    expect(() =>
      db.insert(schema.classes).values({ id: 'bad', name: 'X', section: 'tertiary' }).run(),
    ).toThrow();

    // `packs.verified` is a boolean-backed integer column.
    const [pack] = db.select({ verified: schema.packs.verified }).from(schema.packs).all();
    expect(pack?.verified).toBe(false);
    db.update(schema.packs).set({ verified: true }).where(eq(schema.packs.id, 'p1')).run();
    const verifiedRows = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.packs)
      .where(eq(schema.packs.verified, true))
      .all();
    expect(verifiedRows[0]?.count).toBe(1);

    sqlite.close();
  });
});
