# CBT School - Implementation Progress

## Current Status

**Last Updated:** 2026
**Current Phase:** Phase 6B (Deterministic Pack Generation & Validation) - COMPLETED ✅
**Next Phase:** Phase 6C (School Server Exam Delivery)

## Completed Phases

### Phase 0: Foundation & Infrastructure ✅
- Monorepo setup with Turborepo
- Package structure (cloud-api, school-server, shared-types, exam-core, etc.)
- TypeScript configuration
- Build tooling
- ESLint, Prettier, Vitest

### Phase 1: Authentication & Authorization ✅
- Password hashing with argon2
- Session-based authentication with HttpOnly cookies
- CSRF protection
- OTP for two-factor authentication
- Role-based access control (RBAC)
- CASL for fine-grained permissions
- Audit logging for all auth events
- Password reset flow
- Rate limiting
- Account lockout after failed attempts

### Phase 2: Data Layer & ORM ✅
- Drizzle ORM setup
- PostgreSQL for cloud API
- SQLite for school server
- Database configuration
- Migration scripts
- Seed data utilities
- Database health checks

### Phase 3: User Management ✅
- Students management (CRUD)
- Guardians management (CRUD)
- Guardianships (link/unlink guardians to students)
- Student code generation using exam-core's StudentCodeGenerator
- Invitation system with argon2 token hashing
- Profile management endpoints
- Comprehensive unit tests (14 tests)

### Phase 4: Question Bank - Core (Phase 5A) ✅
- Subjects and levels management
- 5 question types: single_choice, multi_choice, true_false, fill_blank, essay
- Question CRUD operations
- Search and filtering with full-text search
- Tagging system (PostgreSQL arrays)
- Approval workflow (draft → approved → retired)
- Version control with immutability for approved questions
- Comprehensive unit tests (26 tests)

### Phase 5: Question Bank - Advanced (Phase 5B) ✅
- Additional question types: matching, ordering
- Media management (assets, question_assets)
- Import/export job tracking
- Bulk operations (create, update, approve, retire, tag)
- GIN indexes for advanced search
- Extended unit tests (48 tests total)

### Phase 6A: Cloud Exam Management ✅
- **Database Schema:**
  - Tables: classes, exams, exam_classes, exam_questions, sittings, exam_packs
  - Enums: exam_kind, exam_status, sitting_status
  - Migration: 0004_omniscient_dazzler.sql
- **Domain Layer:**
  - Types for classes, exams, sittings, question associations, exam packs
  - Mappers for Drizzle rows to domain records
- **Repository Layer:**
  - ClassRepository, ExamRepository, SittingRepository
  - Drizzle implementations with proper dependency injection
- **Service Layer:**
  - ExamsService: CRUD for classes, exams, sittings, question associations
  - ExamBuilderService: Question addition, reordering, clearing, duplication
  - ExamSchedulerService: Sitting lifecycle (open/close/cancel), bulk scheduling
- **Controller Layer:**
  - ExamsController with REST endpoints
  - Authorization guards (AuthGuard, AbilitiesGuard)
  - Audit logging
- **Tests:**
  - 42 unit tests (25 for ExamsService, 8 for ExamBuilderService, 13 for ExamSchedulerService)
  - All tests passing (185 total, 2 skipped)
- **Module Integration:**
  - ExamsModule enabled in app.module.ts

## Remaining Phases

### Phase 6B: Deterministic Pack Generation & Validation ✅
**Status:** Complete
**Completed work:**
- **exam-core pack primitives** (`packages/exam-core/src/packs/`):
  - `canonical-json.ts`: RFC 8785-style canonical JSON (sorted keys, no whitespace)
  - `zip.ts`: deterministic store-only ZIP writer/reader (dependency-free)
  - `questions-file.ts`: builds `questions.json` (no answer keys, canonical order)
  - `keys-file.ts`: builds the `keys.enc` marking-key payload
  - `pack-builder.ts`: assembles manifest, `files[]` hashes, AES-256-GCM `keys.enc`,
    Ed25519 signature over `SHA-256(manifest.json bytes)`, and the `.cbtpack` ZIP
  - `pack-validator.ts`: `verifyPack` returning named failures (spec 14.4 order)
  - Tests: 14 new (determinism, hash/flip detection, school mismatch, bad key,
    signature failure, key completeness, canonical JSON, ZIP round-trip)
- **Cloud API** (`apps/cloud-api/src/modules/exams/`):
  - `repositories/exam-pack.repository.ts` + Drizzle implementation
  - `repositories/pack-source.repository.ts` + Drizzle implementation (gathers
    exam questions, options, assets and subject)
  - `pack-store.ts`: `PackStore` abstraction + `LocalPackStore` (fs) implementation
  - `exam-pack.service.ts`: `generatePack`, `getPack`, `listPacks`, `downloadPack`,
    `validatePack`; injectable signing config; audit `exam.pack_built`/`pack.validated`
  - `packs.controller.ts`: `GET /packs/:id`, `GET /packs/:id/download`, `POST /packs/validate`
  - `exams.controller.ts`: `POST /exams/:id/publish`, `GET /exams/:id/packs`
  - `exams.module.ts`: wired new providers and controllers
  - Tests: 15 new service tests (happy path, determinism, versioning, ownership,
    unpublishable questions, validation, tamper detection, download)
- **Pack format**: real ZIP `.cbtpack` per CBT-03 section 14 (`manifest.json`,
  `questions.json`, `keys.enc`, `assets/`, `signature.json`). Cloud signs with an
  Ed25519 key from `PACK_SIGNING_PRIVATE_KEY`/`PACK_SIGNING_KEY_ID`; pack key is
  random in production and injectable for deterministic tests.

**Determinism:** identical exam content + `pack_id` + `built_at` + pack key + signing
key produce byte-identical packs.

**Verification:** exam-core 81 tests, cloud-api 200 passed / 2 skipped, typecheck
11/11 tasks, build 9/9 tasks.

### Phase 6C: School Server Exam Delivery ⏳
**Status:** Not Started
**Estimated Duration:** 3-4 days
**Risk Level:** High

**Requirements:**
- Extend school-server SQLite schema with sessions, answers, seats tables
- Implement ExamSessionService for session management
- Implement AutoSaveService for answer auto-save
- Add exam delivery endpoints
- Implement session recovery
- Support states: in_progress, submitted, expired, reset
- Token-based session authentication
- Deterministic question ordering
- Time tracking
- Debounced saves (2 seconds)
- Exponential backoff for failed saves
- Offline queueing for network interruptions
- End-to-end lifecycle tests

**Key Deliverables:**
- SQLite schema extension for school server
- Session management service
- Auto-save service with debouncing and backoff
- Exam delivery endpoints
- Session recovery logic
- E2E tests for exam lifecycle

## Technical Patterns Established

### Repository Pattern
- Repository interfaces defined separately from Drizzle implementations
- Cloud repositories inject `DrizzleService` and resolve the handle lazily via a
  `get db()` getter (`DrizzleDB` stays a type-only import)
- Services inject repositories through `@Optional() @Inject(Drizzle*Repository)`
  tokens and use non-null assertions, since providers only exist when `DATABASE_URL` is set
- All repository methods use explicit school scoping

### Audit Logging
- All mutations logged via `AuditService.record()`
- Audit payload uses `actorUserId`, not `userId`
- Events follow pattern: `resource.action` (e.g., `exam.created`, `sitting.opened`)

### Authorization
- Uses CASL framework with school-scoped resource conditions
- Guards: AuthGuard, AbilitiesGuard
- Controllers require authentication for all endpoints

### State Management
- Exams: draft → ready → published → archived
- Sittings: scheduled → open → closed → cancelled
- Published/archived exams cannot be modified
- Open sittings cannot be deleted; closed sittings cannot be cancelled

### Testing
- Vitest for unit tests
- Use `vi.fn()` for mocks, not `jest.fn()`
- Mock setup in `beforeEach` with vi.mocked()
- Tests follow AAA pattern (Arrange, Act, Assert)

### Database
- Drizzle ORM with PostgreSQL (cloud) and SQLite (school server)
- Schema in `@cbt/shared-types`
- Migrations in app-specific directories
- Proper indexes for performance

## File Structure

```
CBT-School/
├── apps/
│   ├── cloud-api/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/          # Phase 1
│   │   │   │   ├── users/         # Phase 3
│   │   │   │   ├── questions/     # Phase 5A+5B
│   │   │   │   └── exams/         # Phase 6A
│   │   │   ├── shared/database/
│   │   │   │   └── migrations/    # Database migrations
│   │   │   └── app.module.ts       # Main app module
│   │   └── drizzle.config.ts       # Drizzle config
│   └── school-server/
│       └── src/
│           └── shared/database/
│               └── schema.ts       # SQLite schema
├── packages/
│   ├── shared-types/
│   │   └── src/
│   │       └── db/
│   │           └── schema.ts       # Shared PostgreSQL schema
│   └── exam-core/
│       └── src/                    # Shared utilities (shuffle, crypto, marking)
└── docs/
    ├── CBT-Phase-*.md              # Phase specifications
    └── CBT-Database-Architecture.md # Database design
```

## Verification Commands

```bash
# Typecheck all packages
pnpm typecheck

# Run all tests
pnpm test

# Build all packages
pnpm build

# Run specific app tests
pnpm --filter @cbt/cloud-api test
```

## Important Notes

1. **Conditional Module Loading:** UsersModule, QuestionsModule, and ExamsModule use conditional imports based on `DATABASE_URL` to keep E2E tests hermetic.

2. **Repository Dependencies:** Services use optional constructor parameters (`?`) for repositories with non-null assertions (`!`) since they're guaranteed to be injected when DATABASE_URL is set.

3. **Audit Events:** Always use `actorUserId` in audit payloads, not `userId`.

4. **Schema Imports:** Import schema tables from `@cbt/shared-types`, not from a non-existent `@cbt/shared-types/db` package.

5. **Guard Paths:** Guards are in `modules/auth/guards/`, not in `modules/auth/abilities/`.

6. **Test Framework:** Use Vitest, not Jest. Use `vi.fn()` for mocks.

7. **Repository DI (resolved):** every Drizzle repository injects `DrizzleService`
   and reaches the handle through a lazy `get db()` getter; the `users`, `questions`
   and `exams` services declare their repository-interface parameters with
   `@Optional() @Inject(Drizzle*Repository)`, and those modules import `AuthModule`
   for `AuditService` and the guard dependencies. `app.database.module.spec.ts`
   boots the full graph with `DATABASE_URL` set, and `main.ts` was smoke-tested
   against a dummy URL (routes mapped, `/health` 200).

## Next Immediate Steps

1. Verify pack generation against a real PostgreSQL database with seeded questions.
2. Begin Phase 6C (school server exam delivery): pack loader + `verifyPack` wiring,
   session management, auto-save.
