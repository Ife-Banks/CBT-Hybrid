#!/usr/bin/env tsx
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@cbt/shared-types';
import { argon2 } from 'argon2';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client, { schema });

console.log('Seeding database...');

// Create a test school
const schoolId = 'school-test-1';
const schoolExists = await db.query.schools.findFirst({ where: (schools, { eq }) => eq(schools.id, schoolId) });

if (!schoolExists) {
  await db.insert(schema.schools).values({
    id: schoolId,
    code: 'TEST',
    name: 'Test School',
    status: 'active',
    timezone: 'Africa/Lagos',
    maxStudents: 1000,
  });
  console.log('Created test school');
}

// Create a test admin user
const userId = 'user-test-admin-1';
const userExists = await db.query.users.findFirst({ where: (users, { eq }) => eq(users.id, userId) });

if (!userExists) {
  const passwordHash = await argon2.hash('TestPassword123!', {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await db.insert(schema.users).values({
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
  });
  console.log('Created test admin user');
}

console.log('Seeding completed successfully');
await client.end();
