# CBT School - Implementation Progress

## Current Status

**Last Updated:** 2026
**Current Phase:** Phase 9 (Results & Analytics) - COMPLETED ✅
**Next Phase:** Phase 10 (Reporting & Exports) / Phase 11 (Hardening) — see the Phase 9 summary below

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

### Phase 6C: School Server Exam Delivery ✅
**Status:** Complete (student exam API + schema + pack import; console, sync,
asset serving and integrity events deferred — see below)

**Completed work:**
- **exam-core pack runtime** (`packages/exam-core/src/packs/`):
  - `pack-reader.ts`: `readPack` / `decryptKeysFile` reopen a `.cbtpack` and
    decrypt `keys.enc` when a pack key is supplied
  - `pack-marking.ts`: `markPackAnswer` / `markPackSession` mark answers against
    pack keys with the same rules as the cloud
  - `pack-shuffle.ts`: `prepareSessionQuestions` / `optionLabel` build the
    deterministic, seed-derived session view (questions and options)
  - Tests: 23 new
- **School-server schema** (`apps/school-server/src/shared/database/schema.ts`) now
  implements CBT-Database-Architecture section 4.2 in full: `meta`, `classes`,
  `subjects`, `students`, `exams`, `packs`, `sittings`, `seats`, `sessions`
  (exam sessions), `answers`, `results`, `outbox`, `sync_state`, `audit_log`,
  `backup_log`, with CHECK constraints, partial indexes and the
  `prevent_answer_rollback` trigger.
  - The unused staff sign-in table was renamed `sessions` → `auth_sessions` so the
    spec name `sessions` belongs to exam sessions. Migration
    `0001_exam_delivery.sql` performs the rename, drops/recreates the old indexes
    and creates the new tables.
  - `DrizzleSqliteService` now applies migrations on startup, so the server is
    self-sufficient; `build` copies the migrations folder into `dist`.
- **Exam delivery module** (`apps/school-server/src/modules/exam/`):
  - Repositories (`meta`, `catalog`, `pack`, `session`, `outbox`) with Drizzle
    implementations bound through injection tokens
  - `PackImportService`: verifies a pack with `verifyPack` against
    `meta.cloud_public_key` and the school id, stores it in the `active` folder,
    upserts its subject/exam and records the `packs` row; caches parsed packs
  - `TicketService`: HMAC-SHA256 login tickets (15 min) carrying
    `student_id` / `sitting_id` / `seat`
  - `ExamSessionService`: login (code + exam-key checks, seat handling, resume
    with token rotation), start, session read, batched answer auto-save, ping,
    submit (mark + result + outbox) and the expiry sweep
  - `SessionExpiryService`: 5-second sweep submitting overdue sessions
    (`time_up`) and sessions past `window_end` (`window_closed`)
  - `LoginThrottleService`: `SEAT_LOCKED` after five failed logins from a seat
  - `SessionTokenGuard` + `ExamController` exposing the section 16 routes under
    `/api/v1/exam`
  - Tests: 33 new (tickets, throttle, pack import, and an end-to-end HTTP run of
    the full exam lifecycle against a real SQLite database)

**Determinism:** a session's question order is derived from `sessions.seed` and the
pack, so resume, re-read and marking all see the same order; packs are re-verified
on import and answer writes are guarded by `seq`.

**Server-side expiry:** the timer is authoritative — a client that dies mid-exam is
submitted from its last saved answers.

**Verification:** school-server 47 tests, cloud-api 203 passed / 2 skipped,
typecheck 11/11 tasks, build 9/9 tasks, plus a runtime smoke test of
`node dist/main.js` (all section 16 routes mapped, `/api/v1/exam/status` 200 with
startup migrations applied).

**Deferred (out of Phase 6C scope, by decision):**
- Section 16.10 `GET /assets/:asset_id` and `POST /events` (and `session_events`)
- Section 17 invigilator console API
- Section 13 cloud sync agent

### Phase 6C (remaining work) ⏳
**Status:** Deferred items above
**Estimated Duration:** 3-4 days for console + sync

**Requirements:**
- Console API (section 17): PIN sign-in, overview/readiness, open/close sittings
- Sync agent (section 13): push outbox events, pull roster/packs
- Asset serving and integrity events (section 16.10)

### Phase 7: Offline Mode Resilience & Admin Panel ✅
**Status:** Complete
- School-server offline resilience (retry/backoff, connectivity probes) and the
  admin panel endpoints.
- Committed as `98fca25`.

### Phase 8: Sync System ✅
**Status:** Complete
- Conflict detection with version vectors (`sync_entity_versions`, three-way
  merge against `base_json`), pluggable merge strategies (`local_wins`,
  `remote_wins`, `newest_wins`, `merge`, `manual`).
- Batched push/pull, sync metrics, cross-school isolation via namespaced keys
  (`school:<schoolId>:<key>`) with legacy-key migration.
- Roster delta driven by a numeric `roster_cursor`; cloud side keeps a versioned
  in-memory `CloudSyncStore` so deltas and versions are demonstrable.
- Migration `0003_sync_system.sql` (+ journal); tests across school-server and
  cloud-api. Committed as `c613b60`.

### Phase 9: Results & Analytics ✅
**Status:** Complete (server-side/logic; document encoders deferred)

**Deliverables:**
- **Data model** (`packages/shared-types/src/db/schema.ts`): enums
  `result_status`, `submission_status`, `remark_run_status`,
  `notification_channel`, `notification_status`; tables `grade_scales`,
  `submissions`, `submission_answers`, `results`, `remark_runs`, `notifications`.
  Migrations `0005_past_redwing.sql` and `0006_dizzy_iceman.sql`.
- **Marking & grading** (`results/domain/`): cloud re-marks submissions with the
  shared `exam-core` engine; `grading.ts` owns the default A–F scale, band
  validation and `percentOf`; `build-keys.ts` turns stored questions into pack
  answer keys.
- **Results service** (`results/results.service.ts`): `processSubmission`,
  `recordSchoolScore` (cloud/school mismatch detection), `reviewResults`,
  `releaseResults` (BR-14: reviewed-only, 409 with the unreviewed count),
  `withdrawResults`, `voidSubmission`, key corrections
  (`previewKeyCorrection` / `applyKeyCorrection` / `cancelKeyCorrection`,
  BR-12/BR-15) and `generateResultReport` / `generateStudentReport`.
- **Sync intake** (`results/results-intake.service.ts`): applies
  `session.started|submitted|scored|reset` events idempotently; wired into
  `POST /sync/v1/results` (the controller returns per-event `results[]`).
- **Analytics** (`analytics/`): `calculateClassStatistics`,
  `examStatistics`, `getPerformanceTrends`, `detectExamAnomalies`,
  `generateDashboardData`, `classShare` with pure domain helpers for
  statistics, trends and anomalies.
- **Parent portal** (`parent-portal/`): children switcher, released-only
  results, withdrawn → `under_review`, performance history; every query
  enforces guardianship, `can_view_results` and released status (404, never 403).
- **Notifications** (`notifications/`): queue (score-free templates), channel
  selection (BR-21), log/retry/usage, simulated delivery sweep.
- **HTTP**: `ResultsController`, `ExamKeyCorrectionsController`,
  `GradeScaleController`, `ReportsController`, `AnalyticsController`,
  `ParentPortalController`, `NotificationsController`; all wired into
  `app.module.ts`. Repositories use Drizzle when `DATABASE_URL` is set and
  in-memory implementations otherwise.

**Verification:** shared-types 22, exam-core 104, school-server 117, cloud-api
295 passed / 2 skipped; typecheck 11/11 tasks; build 9/9 tasks.

**Deferred (by decision):** binary `.xlsx`/`.pdf` encoders (reports return the
structured report), real email/SMS transport, and per-term grouping.

## Technical Patterns Established

### Repository Pattern
- Repository interfaces defined separately from Drizzle implementations
- Cloud repositories inject `DrizzleService` and resolve the handle lazily via a
  `get db()` getter (`DrizzleDB` stays a type-only import)
- Services inject repositories through `@Optional() @Inject(Drizzle*Repository)`
  tokens and use non-null assertions, since providers only exist when `DATABASE_URL` is set
- School-server repositories inject `DrizzleSqliteService` (same lazy `get db()`
  getter) and are bound to interface tokens (`META_REPOSITORY`,
  `CATALOG_REPOSITORY`, `PACK_REPOSITORY`, `SESSION_REPOSITORY`,
  `OUTBOX_REPOSITORY`) in `ExamModule`
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
- Cloud schema in `@cbt/shared-types`
- School-server schema is app-local
  (`apps/school-server/src/shared/database/schema.ts`, CBT-Database-Architecture
  section 4.2)
- Migrations in app-specific directories; `DrizzleSqliteService` applies them on
  startup and `build` copies the folder into `dist`
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
│           ├── modules/
│           │   └── exam/           # Phase 6C exam delivery
│           └── shared/database/
│               ├── schema.ts       # SQLite schema (section 4.2)
│               └── migrations/     # 0000 auth + 0001 exam delivery
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

1. Phase 6C remaining: section 17 console API (PIN sign-in, overview/readiness,
   open/close sittings) and section 16.10 asset/event endpoints.
2. Phase 8: sync agent pushing the `outbox` (`sitting.*`, `session.*`) to the
   cloud `POST /sync/v1/results` and pulling roster/packs.
3. Verify pack generation against a real PostgreSQL database with seeded questions.
