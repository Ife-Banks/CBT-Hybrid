#!/usr/bin/env tsx
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../src/shared/database/schema';
import { argon2 } from 'argon2';

const dbPath = process.env.SCHOOL_DB_PATH || './data/school.db';

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = FULL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite, { schema });

console.log('Seeding SQLite database...');

// Create a test school
const schoolId = 'school-test-1';
const schoolExists = db.query.schools.findFirst({ where: (schools, { eq }) => eq(schools.id, schoolId) });

if (!schoolExists) {
  db.insert(schema.schools).values({
    id: schoolId,
    code: 'TEST',
    name: 'Test School',
    status: 'active',
    timezone: 'Africa/Lagos',
    maxStudents: 1000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  console.log('Created test school');
}

// Create a test admin user
const userId = 'user-test-admin-1';
const userExists = db.query.users.findFirst({ where: (users, { eq }) => eq(users.id, userId) });

if (!userExists) {
  const passwordHash = await argon2.hash('TestPassword123!', {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  db.insert(schema.users).values({
    id: userId,
    schoolId,
    role: 'school_admin',
    fullName: 'Test Admin',
    email: 'admin@test.school',
    phone: '+2348000000000',
    passwordHash,
    status: 'active',
    failedLoginAttempts: 0,
    mustChangePassword: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  console.log('Created test admin user');
}

console.log('Seeding completed successfully');
sqlite.close();
