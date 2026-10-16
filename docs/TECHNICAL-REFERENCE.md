# CBT School - Technical Reference

## Architecture Patterns

### Repository Pattern

**Interface Definition:**
```typescript
// Define interface in repositories/*.repository.ts
export interface ExamRepository {
  create(dto: CreateExamDto, schoolId: string, createdBy: string): Promise<ExamDomainRecord>;
  findById(id: string): Promise<ExamDomainRecord | null>;
  findBySchoolId(schoolId: string): Promise<ExamDomainRecord[]>;
  // ... other methods
}
```

**Drizzle Implementation:**
```typescript
// Implement in repositories/drizzle-*.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { DrizzleService } from '../../../shared/database/drizzle.service';
import { exams } from '@cbt/shared-types';

@Injectable()
export class DrizzleExamRepository implements ExamRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }

  async create(dto: CreateExamDto, schoolId: string, createdBy: string): Promise<ExamDomainRecord> {
    const [row] = await this.db
      .insert(exams)
      .values({ ...dto, schoolId, createdBy })
      .returning();
    return mapToExamDomain(row);
  }
}
```

The database handle is resolved lazily through `DrizzleService.getDb()`, which
connects during `onModuleInit`. Never inject a raw `DrizzleDB`: it is a type
alias with no runtime token, so Nest cannot resolve it.

**Service Injection:**
```typescript
// Repository interfaces are TypeScript types, so Nest needs an explicit token.
// Use @Optional() because the repository providers only exist when DATABASE_URL is set.
constructor(
  @Optional() @Inject(DrizzleExamRepository) private readonly examRepo?: ExamRepository,
  @Optional() private readonly auditService?: AuditService,
) {}

// Usage - non-null assertion since it's guaranteed when DATABASE_URL is set
const exam = await this.examRepo!.findById(id);
```

### Audit Logging Pattern

**Always use `actorUserId`, not `userId`:**
```typescript
await this.auditService.record({
  action: 'exam.created',
  outcome: 'success',
  schoolId,
  actorUserId,  // Correct
  targetId: exam.id,
  targetType: 'exam',
  detail: { title: exam.title },
});
```

**Event Naming Convention:**
- `resource.action` (e.g., `exam.created`, `sitting.opened`, `class.deleted`)
- Use lowercase with underscores
- Past tense for completed actions (created, deleted, opened, closed)

### Authorization Pattern

**Controller Guards:**
```typescript
import { AuthGuard } from '../auth/guards/auth.guard';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';

@Controller('exams')
@UseGuards(AuthGuard, AbilitiesGuard)
export class ExamsController {
  // All endpoints require authentication and ability checks
}
```

**CASL Abilities:**
- School-scoped resources use conditions
- Define abilities in `modules/auth/abilities/ability.factory.ts`
- Example: `can('manage', 'Exam', { schoolId: user.schoolId })`

### State Management Patterns

**Exam States:**
```typescript
enum ExamStatus {
  DRAFT = 'draft',
  READY = 'ready',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}
```

**State Transition Rules:**
- Draft → Ready → Published (can only move forward)
- Published exams cannot be modified (create new version instead)
- Archived exams are read-only

**Sitting States:**
```typescript
enum SittingStatus {
  SCHEDULED = 'scheduled',
  OPEN = 'open',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}
```

**State Transition Rules:**
- Scheduled → Open (only within time window)
- Open → Closed (manual or automatic after window end)
- Scheduled → Cancelled (only before opening)
- Closed cannot be cancelled

### Testing Pattern

**Vitest Setup:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ExamsService } from './exams.service';

describe('ExamsService', () => {
  let service: ExamsService;
  let examRepo: ExamRepository;
  let auditService: any;

  beforeEach(() => {
    examRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      // ... other methods
    } as unknown as ExamRepository;

    auditService = {
      record: vi.fn(),
      list: vi.fn(),
    };

    service = new ExamsService(examRepo, auditService);
  });

  it('should create an exam', async () => {
    const mockExam = { /* ... */ };
    vi.mocked(examRepo.create).mockResolvedValue(mockExam);

    const result = await service.createExam(dto, 'school-1', 'user-1');

    expect(result).toEqual(mockExam);
    expect(examRepo.create).toHaveBeenCalledWith(dto, 'school-1', 'user-1');
    expect(auditService.record).toHaveBeenCalled();
  });
});
```

**Important:**
- Use `vi.fn()`, not `jest.fn()`
- Use `vi.mocked()`, not `jest.mocked()`
- Mock repositories as unknown with the interface type
- Use `skip` for incomplete tests instead of failing tests

### Database Schema Pattern

**Shared Schema in `@cbt/shared-types`:**
```typescript
// packages/shared-types/src/db/schema.ts
import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const exams = pgTable('exams', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  title: text('title').notNull(),
  // ... other fields
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

**Migration Pattern:**
```sql
-- apps/cloud-api/src/shared/database/migrations/0004_omniscient_dazzler.sql
CREATE TYPE exam_kind AS ENUM ('test', 'exam', 'practice', 'quiz');
CREATE TYPE exam_status AS ENUM ('draft', 'ready', 'published', 'archived');

CREATE TABLE exams (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind exam_kind NOT NULL DEFAULT 'exam',
  status exam_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_exams_school_status ON exams(school_id, status);
```

**Indexing Strategy:**
- Composite indexes on (school_id, status) for filtered queries
- Indexes on foreign keys (school_id, subject_id, etc.)
- GIN indexes on arrays (tags) and JSONB columns
- Partial indexes for common query patterns

### Service Layer Pattern

**Method Signature Pattern:**
```typescript
// Always include schoolId and actorUserId for mutations
async createExam(
  dto: CreateExamDto,
  schoolId: string,
  actorUserId: string,
): Promise<ExamDomainRecord> {
  // Verify school ownership
  // Create record
  // Log audit event
  // Return result
}
```

**Ownership Check Pattern:**
```typescript
async updateExam(
  id: string,
  dto: UpdateExamDto,
  schoolId: string,
  actorUserId: string,
): Promise<ExamDomainRecord> {
  const exam = await this.examRepo.findById(id);
  if (!exam) {
    throw new NotFoundException('Exam not found');
  }
  if (exam.schoolId !== schoolId) {
    throw new ConflictException('Exam belongs to a different school');
  }
  // ... update logic
}
```

**State Restriction Pattern:**
```typescript
async addQuestionToExam(
  examId: string,
  questionId: string,
  schoolId: string,
  actorUserId: string,
): Promise<void> {
  const exam = await this.examRepo.findById(examId);
  if (exam.status === 'published' || exam.status === 'archived') {
    throw new ConflictException('Cannot modify published or archived exams');
  }
  // ... add question logic
}
```

### Controller Pattern

**DTO Pattern:**
```typescript
// dto/exams.dto.ts
import { z } from 'zod';

export const createExamSchema = z.object({
  title: z.string().min(1).max(255),
  subjectId: z.string().uuid(),
  durationMin: z.number().int().min(1).max(480),
  // ... other fields
});

export type CreateExamDto = z.infer<typeof createExamSchema>;
```

**Endpoint Pattern:**
```typescript
@Post()
async create(
  @Body() dto: CreateExamDto,
  @Request() req: { user: { id: string; schoolId: string } },
): Promise<ExamDomainRecord> {
  return this.examsService.createExam(dto, req.user.schoolId, req.user.id);
}
```

**Error Handling:**
- Use NestJS built-in exceptions: `NotFoundException`, `ConflictException`, `BadRequestException`
- Return appropriate HTTP status codes
- Include descriptive error messages

### Module Pattern

**Conditional Loading (for E2E tests):**
```typescript
@Module({
  imports: [
    // Only load DatabaseModule/AuthModule if DATABASE_URL is set.
    // AuthModule supplies AuditService and the guards' dependencies.
    ...(process.env.DATABASE_URL ? [DatabaseModule, AuthModule] : []),
  ],
  controllers: [
    // Only register controllers if DATABASE_URL is set
    ...(process.env.DATABASE_URL ? [ExamsController] : []),
  ],
  providers: [
    // Only provide services and their Drizzle repositories if DATABASE_URL is set.
    // Repositories are concrete classes so they work as their own DI token.
    ...(process.env.DATABASE_URL
      ? [
          ExamsService,
          ExamBuilderService,
          ExamSchedulerService,
          DrizzleClassRepository,
          DrizzleExamRepository,
          DrizzleSittingRepository,
        ]
      : []),
  ],
})
export class ExamsModule {}
```

The `process.env.DATABASE_URL` checks run while the decorator is evaluated
(import time), so the variable must be set before `AppModule` is imported.

## Common Imports

**Schema from shared-types:**
```typescript
import { exams, classes, sittings } from '@cbt/shared-types';
```

**DrizzleService and its `DrizzleDB` type from the local service:**
```typescript
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { DrizzleService } from '../../../shared/database/drizzle.service';

// Repositories inject the service and reach the handle through the getter.
@Injectable()
export class DrizzleFooRepository implements FooRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  private get db(): DrizzleDB {
    return this.drizzle.getDb();
  }
}
```

**NestJS Common:**
```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
```

**Audit Service:**
```typescript
import { AuditService } from '../auth/audit/audit.service';
```

**Guards:**
```typescript
import { AuthGuard } from '../auth/guards/auth.guard';
import { AbilitiesGuard } from '../auth/guards/abilities.guard';
```

## Code Style Guidelines

1. **No comments** unless explicitly asked (NestJS convention)
2. **Compact code** - collapse duplicate else branches, avoid unnecessary nesting
3. **Idiomatic TypeScript** - use language features appropriately
4. **Minimal error handling** - errors should be handled at appropriate boundaries, not on every line
5. **Non-null assertions** - use `!` when value is guaranteed by context (e.g., after null check)

## File Naming Conventions

- Services: `*.service.ts`
- Controllers: `*.controller.ts`
- Repositories: `*.repository.ts` (interface), `drizzle-*.repository.ts` (implementation)
- DTOs: `*.dto.ts`
- Domain types: `types.ts`
- Mappers: `mappers.ts`
- Tests: `*.service.spec.ts`, `*.controller.spec.ts`
- Modules: `*.module.ts`

## Migration Naming

Use Drizzle Kit's auto-generated names with descriptive prefix:
- `0001_thick_ego.sql` - First migration
- `0002_jittery_pride.sql` - Second migration
- `0003_complex_redwing.sql` - Third migration
- `0004_omniscient_dazzler.sql` - Fourth migration

## Environment Variables

**Cloud API:**
- `DATABASE_URL` - PostgreSQL connection string (required for production, optional for E2E tests)
- `SESSION_SECRET` - Secret for session encryption
- `JWT_SECRET` - Secret for JWT tokens (if using JWT)
- `REDIS_URL` - Redis connection string (for session storage, if used)

**School Server:**
- `DATABASE_PATH` - Path to SQLite database file
- `CLOUD_API_URL` - URL of cloud API for synchronization

## Running Commands

**Development:**
```bash
# Start cloud API
pnpm --filter @cbt/cloud-api dev

# Start school server
pnpm --filter @cbt/school-server dev
```

**Database:**
```bash
# Generate migration
pnpm --filter @cbt/cloud-api drizzle-kit generate

# Run migration
pnpm --filter @cbt/cloud-api drizzle-kit migrate

# Seed database
pnpm --filter @cbt/cloud-api run seed
```

**Testing:**
```bash
# Run all tests
pnpm test

# Run specific test file
pnpm --filter @cbt/cloud-api test exams.service.spec.ts

# Run tests in watch mode
pnpm test --watch
```

**Build:**
```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @cbt/cloud-api build
```

**Type Checking:**
```bash
# Typecheck all packages
pnpm typecheck

# Typecheck specific package
pnpm --filter @cbt/cloud-api typecheck
```

## Known Limitations & TODOs

1. **Filter-based question selection** in ExamBuilderService is not implemented (throws ConflictException)
2. **Random question selection** in ExamBuilderService is not implemented (throws ConflictException)
3. **Import-based question selection** in ExamBuilderService is not implemented (throws ConflictException)
4. Real database behavior with PostgreSQL environment not yet verified
5. School server: the section 17 console API, section 13 sync agent and the
   section 16.10 asset/integrity-event endpoints are not implemented yet. The
   student exam API (section 16.2–16.9) and pack import are complete.

Repository DI was fixed after Phase 6B: every Drizzle repository injects
`DrizzleService`, the `users`/`questions`/`exams` services use explicit
`@Optional() @Inject(...)` tokens, and those modules import `AuthModule` for
`AuditService` and the guard dependencies. `app.database.module.spec.ts` boots
the full dependency graph with `DATABASE_URL` set to guard against regressions.

School-server exam delivery (Phase 6C) is implemented in
`apps/school-server/src/modules/exam/`: repositories are bound to interface
tokens, `PackImportService` verifies packs with `meta.cloud_public_key`,
`ExamSessionService` owns the section 16 flow and `SessionExpiryService` runs the
5-second expiry sweep. `DrizzleSqliteService` applies the section 4.2 schema
migration on startup. The pack data key is stored in `meta` under
`pack_key:<pack_id>`; Phase 8 replaces that with device-key wrapping (spec 13.6).

## External Dependencies

**npm packages:**
- `@nestjs/common` - NestJS framework
- `@nestjs/core` - NestJS core
- `drizzle-orm` - ORM
- `@neondatabase/serverless` - PostgreSQL driver (cloud)
- `better-sqlite3` - SQLite driver (school server)
- `argon2` - Password hashing
- `zod` - Schema validation
- `vitest` - Testing framework
- `@casl/ability` - Authorization
- `turbo` - Build system

**Internal packages:**
- `@cbt/shared-types` - Shared database schema and types
- `@cbt/exam-core` - Shared utilities (shuffle, crypto, marking, student codes)
