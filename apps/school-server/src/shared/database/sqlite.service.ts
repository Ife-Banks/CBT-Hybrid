import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SchoolConfigService } from '../../common/config/school-config.service';

/**
 * SQLite storage for the school server (Phase 1 task 2).
 *
 * Uses Node's built-in `node:sqlite` so there is no native build step. WAL mode
 * and foreign keys are enabled on open. The full schema (a subset of the cloud
 * schema) is created in later phases; for now a `meta` table records the schema
 * version.
 */
@Injectable()
export class SqliteService implements OnModuleInit, OnModuleDestroy {
  private db?: DatabaseSync;

  constructor(private readonly config: SchoolConfigService) {}

  onModuleInit(): void {
    mkdirSync(this.config.dataDir, { recursive: true });
    for (const folder of Object.values(this.config.examPackFolders)) {
      mkdirSync(folder, { recursive: true });
    }

    const db = new DatabaseSync(this.config.dbPath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('schema_version', '0');
    this.db = db;
  }

  onModuleDestroy(): void {
    this.db?.close();
    this.db = undefined;
  }

  /** The open database handle. Throws if used before initialisation. */
  get database(): DatabaseSync {
    if (!this.db) throw new Error('SqliteService is not initialised');
    return this.db;
  }

  /** Read the recorded schema version. */
  schemaVersion(): string | undefined {
    const row = this.database.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
    return row ? String((row as { value: unknown }).value) : undefined;
  }

  /** Cheap connectivity check: `true` when a trivial query succeeds. */
  ping(): boolean {
    try {
      const row = this.database.prepare('SELECT 1 AS ok').get();
      return (row as { ok?: number } | undefined)?.ok === 1;
    } catch {
      return false;
    }
  }
}
