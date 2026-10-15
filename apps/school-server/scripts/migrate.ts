#!/usr/bin/env tsx
import { runMigrations } from '../src/shared/database/migration-runner';

const dbPath = process.env.SCHOOL_DB_PATH || './data/school.db';

await runMigrations(dbPath);
