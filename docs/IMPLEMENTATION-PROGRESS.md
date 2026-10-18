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
**Status:** Complete (server-side/logic, including document encoders)

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
326 passed / 2 skipped; typecheck 11/11 tasks; build 9/9 tasks.

**Deferred (by decision):** real email/SMS transport, and per-term grouping.

### Phase 9 gap closure ✅
**Status:** Complete — closes the gaps found in the Phase 9 review against API
spec sections 9–11.

**Deliverables:**
- **Settings module** (`settings/`): typed view over `schools.settings`
  (`GET/PATCH /settings`, API spec 11.3) with documented defaults,
  key-by-key nested merge and validation; `release_policy`,
  `notify_on_remark`, `paid_channels_enabled`/`paid_message_monthly_cap` are now
  consumed by the results and notifications modules.
- **Idempotency** (`common/idempotency/`): global module + `IdempotencyInterceptor`
  implementing `Idempotency-Key` (API spec 1.6). A repeat with the same key and
  body replays the first response for 24 hours; a different body is
  `409 IDEMPOTENCY_KEY_REUSED`. Applied to `POST /results/release` and
  `POST /exams/:id/key-corrections/:runId/apply`.
- **Audit entries**: `results.reviewed`, `results.released`, `results.withdrawn`,
  `results.marked` and `key_correction.applied` (plus
  `key_correction.pack_rebuild_failed`) recorded through `AuditService`.
- **Release policy** (BR-14): `ResultsService.releaseResults` takes the caller
  actor and allows School Admin always, a teacher only when `release_policy` is
  `class_teacher`.
- **Key-correction versioning** (BR-12): `KeyCorrectionStore` (Drizzle +
  in-memory). On apply, the corrected question is created as a new approved
  `version + 1` superseding the original, its options/assets are copied with the
  corrected `is_correct` flags, the question is swapped into the exam and
  `exam_packs.key_version` is bumped — in one transaction. A new pack version is
  then built through `ExamPackService` (post-transaction).
- **Manual/essay marking** (§14.5): `POST /results/:id/answers/:questionId/marks`
  sets a score, recomputes the result total/percent/grade and bumps the revision.
- **Correct answers** (§9.2): `GET /results/:id` now returns each answer's
  `correct` flag and a structured `correctAnswer`.
- **Parent notification ownership**: `POST /parent/notifications/:id/read` only
  marks the signed-in guardian's own notification (`404` otherwise).
- **`notify_on_remark`** (BR-15): a changed released result notifies its
  guardians unless the school turned it off.
- **Paid-channel gating** (§11.3, BR-21): a disabled `sms`/`whatsapp` channel or
  a school over its monthly cap silently downgrades to email/in-app and records
  `downgraded_from`.
- **Report exports** (§9.2): `GET /exams/:id/results.xlsx|.csv|.pdf` and
  `GET /students/:id/results.pdf`. The `.xlsx` is a real Office Open XML workbook
  built with the exam-core stored-ZIP writer; the `.pdf` is a minimal font-only
  PDF document.
- **Parent account** (§10): `GET/PATCH /parent/me` (notification preferences,
  persisted on `guardians.notification_prefs`), `POST /parent/me/email/otp` and
  `POST /parent/me/email/verify` (hashed, throttled, attempt-limited code).
- **Richer dashboards** (§11.1): `GET /dashboard/admin|teacher` add
  sittings/readiness, pending invitations, in-flight imports, last sync time and
  the caller's exams (a teacher sees only their own).
- **Results list** (§9.2): cursor pagination and `last_synced_at` for the exam;
  parent results/trends accept `term_id` (accepted for compatibility).

**Migrations:** `0007_perpetual_prowler.sql` (adds `guardian_email` to
`otp_purpose` and `guardians.notification_prefs`).

**Deferred (by decision):** term modelling (so `term_id` filters are
accept-and-document), the real email/SMS transports, and cloud server-health
metrics (the cloud schema has no device table).

### Phase 9 §11.4 audit log & exports ✅
**Status:** Complete — the remaining slice of API spec section 11.

**Deliverables:**
- **Durable audit log** (`audit_logs`): append-only table (`audit_outcome`,
  `school_id`/`actor_user_id` FKs, `entity_type`/`entity_id`, request metadata,
  `detail` jsonb). `AuditService` now persists every event (fire-and-forget, so
  the guards and services that call it stay synchronous) behind an
  `AUDIT_LOG_REPOSITORY` port (Drizzle + in-memory). Audit call sites now carry
  `school_id`/`actor_role` so a School Admin sees their own school's entries.
- **`GET /audit-logs`** (§11.4, US-16.1): read-only listing with
  `actor_id`, `action`, `entity`, `from`, `to` and opaque cursor pagination
  (newest first). A school user is scoped to their school; the platform owner
  gets a cross-school view. No update or delete route exists.
- **`GET /exports/:name.:ext`** (§11.4, US-14.3): School Admin only. `name` is
  `students`, `guardians`, `invitations`, `notifications` or `audit`; `ext` is
  `csv` or `xlsx` (the `.xlsx` reuses the exam-core stored-ZIP writer). Each
  export writes a `data.exported` audit entry. `attendance` is accepted as a
  documented name but returns `404` (attendance is not modelled yet).
- **Ability vocabulary:** new `Export` subject (School Admin only); `data:export`
  permission added to the documentation view.

**Migrations:** `0008_oval_falcon.sql` (adds the `audit_outcome` enum and the
`audit_logs` table with its indexes).

**Deferred (by decision):** the `attendance` export (no attendance model).

### Student data requests (US-16.2) ✅
**Status:** Complete — the two §5 data-protection endpoints.

**Deliverables:**
- **`POST /students/:id/data-export`**: returns a ZIP of everything held about a
  student (`student.json`, `guardians.json`, `results.csv`, `README.txt`) using
  the exam-core stored-ZIP writer. School Admin only; scoped to the caller's
  school; records a `data.exported` audit entry.
- **`POST /students/:id/anonymise`**: replaces the identity fields (name, gender,
  date of birth, photo, admission number → `ANON-…` pseudonym) and keeps scores
  only when `retention.results_years_after_leaving > 0`; a rule of zero also
  purges the student's results and submissions. Records a `student.anonymised`
  audit entry.
- New `student-data` module with a `STUDENT_DATA_REPOSITORY` port (Drizzle +
  in-memory), reusing the settings retention rule and the audit log.

### Import pipeline (§7) ✅
**Status:** Complete — templates, upload, parse, row preview/fix/skip, confirm,
cancel and report.

**Deliverables:**
- `GET /imports/templates/:kind.:ext` — generated templates for questions
  (csv/xlsx/docx), students, guardians and teachers (csv/xlsx).
- `POST /imports` — multipart upload (field `file`, plus `kind` and, for
  questions, `subject_id`/`level_id`). Returns `202 { id, status: "queued" }`.
  Files over 10 MB, macro-enabled workbooks, a wrong extension and files past
  the row cap (200 questions / 5000 rows) are rejected with
  `IMPORT_FILE_REJECTED`.
- `GET /imports`, `GET /imports/:id`, `GET /imports/:id/rows` (status filter +
  cursor), `PATCH /imports/:id/rows/:rowId` (fix and re-validate),
  `POST /imports/:id/rows/:rowId/skip`, `POST /imports/:id/confirm` (idempotent),
  `DELETE /imports/:id` and `GET /imports/:id/report.csv`.
- Parsers: RFC-4180 CSV, a dependency-free `.xlsx` reader (shared strings +
  inline strings) and a `.docx` paragraph→question reader. One validator per
  kind emits the documented codes (`ANSWER_MATCHES_NO_OPTION`, `TOO_FEW_OPTIONS`,
  `DUPLICATE_OPTIONS`, `LIKELY_DUPLICATE`, `MARKS_INVALID`, `IMAGE_NOT_FOUND`,
  plus student/guardian/teacher codes).
- New `imports` module with an `IMPORT_REPOSITORY` port (Drizzle + in-memory);
  confirm creates question drafts, students, guardians (+ links) and invited
  teacher accounts. Authorisation is `import` on the kind's subject, so teachers
  can import questions only and School Admin everything.
- Migration `0009_even_raza.sql` (extends the import-job enums, adds
  `import_job_rows` and the `source_file`/`subject_id`/`level_id`/
  `failure_reason` columns).

**Deferred (by decision):** the `images.zip` companion upload, so a non-empty
`image` column reports `IMAGE_NOT_FOUND`; and real Excel formula/style fidelity
(only cell values are read).

### API documentation (Swagger) ✅
- The cloud API now serves an OpenAPI document: Swagger UI at `/docs` and the
  JSON at `/docs-json`, built with `@nestjs/swagger` (matching the school
  server). Bearer auth is declared, and the document covers every registered
  controller. Global-prefix routes appear under `/api/v1`.
- An e2e test generates the document and asserts the health, auth, imports and
  student-data paths are present.

### Windows service and installer (M12, first slice) ✅
- `apps/installer` is no longer a placeholder. It now assembles and compiles a
  real Windows deployment for the school server (CBT-04 section 6).
- `build.mjs` builds the staging tree: bundles the school server to
  `app/server.cjs` with esbuild, copies the console page, exam client and
  migrations, ships `better-sqlite3`, `argon2` and `swagger-ui-dist`, copies the
  Node runtime, and drops in `SchoolCBT.xml` and `tools/`.
- `SchoolCBT.xml` is the WinSW service definition (automatic start, restart on
  failure, `LocalService`, `CBT_DATA_DIR`/`SCHOOL_MIGRATIONS_DIR`, rolling logs).
- `installer.iss` is the Inno Setup script: Windows 10 x64 guard, port probe with
  alternate-port fallback, upgrade stop/backup/replace, service install/start,
  local-subnet firewall rule, power settings, lab-PC shortcut files and the
  first-run page.
- `tools/*.ps1` add/remove the firewall rule, disable sleep/hibernate and write
  the lab shortcuts (kiosk Chrome/Edge with the PC name as the seat label).
- Verified by booting the bundled server: `/health` returns `ok` with the SQLite
  database migrated from the shipped migrations folder, and `/docs` plus
  `/docs-json` respond.
- **Deferred (M12 remainder):** in-app update/rollback, restore from backup or
  cloud, and the cloud side of activation (`/sync-devices/activation-codes` and
  `/sync/v1/activate`). WinSW must be placed in `apps/installer/vendor/` and Inno
  Setup installed to compile.

### First-run setup page (M12, second slice) ✅
- The server side of `/setup` (CBT-04 section 6.3 step 8) now exists, so the
  installer's "finish setup" link resolves instead of 404ing.
- `GET /setup` serves `public/setup.html`; its CSS and JS are shipped beside it
  and served from `/static/`, so the page works under the strict CSP helmet
  applies to every response. `main.ts` also serves the exam client at `/`.
- `SetupController` (`/api/v1/setup`) exposes `GET status`, `POST school`,
  `POST console-pin`, `POST backup-path`, `POST activate`, `GET lab-shortcut`
  and the `.url`/`.bat` downloads. `SetupService` stores the school name, hashes
  the initial console PIN with argon2 (only while no PIN exists), checks the
  second backup folder is writable before recording it, and generates the lab
  shortcut files from the server's LAN address (spec 6.6).
- `ActivationService` performs the one unsigned sync call, `POST
  /sync/v1/activate` (spec 13.3): it sends the code, device name, software
  version, platform block and a `machine_id_hash`, then stores the school,
  device id, key id, cloud public key and cursor in `meta`, and the issued
  secret through `DeviceSecretStore`. Cloud rejections map onto
  `ACTIVATION_CODE_INVALID` / `ACTIVATION_CODE_EXPIRED` / `ACTIVATION_CODE_USED`.
- `DeviceSecretStore` writes `<dataDir>/secrets/device.bin`, protected with
  Windows DPAPI at machine scope via PowerShell (spec 6.1); where DPAPI is
  unavailable it logs a warning and falls back to the raw bytes, and tests use
  an in-memory store. `MACHINE_ID_HASH` and `ACTIVATION_HTTP` are injectable so
  no test spawns PowerShell or touches the network.
- `zodOrThrow` moved to `common/validation/zod.ts` (the console DTO re-exports
  it) so the setup DTOs share it.
- Covered by three specs: `setup.service.spec.ts`, `activation.service.spec.ts`,
  `device-secret.store.spec.ts`, plus `setup.e2e.spec.ts` (page, status, PIN
  once-only, backup path, lab shortcut, activation and completed setup).
- **Deferred (M12 remainder):** restore from the cloud backup, and the QR code on
  the setup page. The console page still has inline CSS/JS, so it is not served
  yet.

### In-app update and rollback (M12, third slice) ✅
- The server side of CBT-04 section 6.4 exists: `UpdateService` +
  `UpdateController` under `/api/v1/console/updates` (`GET` status, `POST check`,
  `POST download`, `POST apply`).
- `checkForUpdate()` posts the heartbeat (`POST /sync/v1/heartbeat`, API spec
  13.8) and records the offered release in `meta`. The request carries the fields
  this server already knows (`software_version`, `os_version`, `platform`,
  `uptime_seconds`, `db_size_mb`, `disk_free_mb`, `last_backup_at`,
  `last_backup_ok`, `open_sittings`); cursor, pack list and outbox counts arrive
  when the sync agent's heartbeat lands. Like the rest of the sync code the call
  is unsigned today.
- `downloadUpdate()` streams the release to `<dataDir>/updates/`, hashing as it
  goes, and only stages it when the SHA-256 matches the offer. Non-http(s) URLs
  and a package for the version already running are refused.
- `applyUpdate()` is refused with `CONFLICT` while a sitting is `open` or starts
  within two hours (API spec 17.5), which needed a new
  `findBlockingSitting(dueBefore)` on the catalog repository. It then writes
  `updates/SchoolCBT-Update.cmd` and asks for elevation on it.
- `tools/apply-update.ps1` does the swap in the elevated process: stop the
  service, back up the database plus `app/`, `node.exe`, `SchoolCBT.xml` and
  `VERSION.txt`, run the downloaded installer silently, start the service and
  poll `/api/v1/exam/status` for 60 seconds. If it stays unhealthy it restores
  the backup, restarts and records `update_failed` in `updates/last-result.json`,
  which the status endpoint reads back and the next heartbeat can report.
  Migrations are forward-only, so a rollback restores the pre-update database.
- Auto-update (`AUTO_UPDATE=true`) stages and applies on a background timer when
  no sitting is open or due within two hours; the interval is
  `UPDATE_CHECK_MINUTES` (default 5, 0 disables it).
- The installer preserves the configured port on upgrade (it reads
  `SchoolCBT.xml` and treats that port as ours rather than "in use"), which the
  silent update path depends on because the wizard never runs.
- Covered by `update.service.spec.ts` (offer, checksum mismatch, staged helper,
  the sitting rules, refusal to elevate, result read-back) and
  `update.e2e.spec.ts` (routes, sitting guard, applying once closed), plus a
  packaged smoke test with a fake cloud: heartbeat → offer → verified download.
- **Deferred (M12 remainder):** restore from the cloud (`PUT /sync/v1/backups/:name`
  and `GET /sync/v1/backups/latest`, API spec 13.9), the console Apply button (the
  console UI is still M11-deferred) and the VM drills. The swap itself still has to
  be proven on a Windows VM.

### Backups and restore (M12, fourth slice) ✅
- `BackupService` (`modules/backup/`) takes full copies of the live database with
  the SQLite backup API (`DrizzleSqliteService.backupTo`), which is safe while the
  Exam API is serving. Copies are named `school-YYYYMMDD-HHmmss.db`, hashed with
  SHA-256, copied to the configured second location (a USB drive or a share,
  otherwise the backup still succeeds and the warning is logged), recorded in
  `backup_log` and pruned to the newest `BACKUP_RETENTION` (default 30, US-15.4).
- They run after every sitting closes (hooked into `ConsoleService.closeSitting`,
  and a failed backup never fails the close) and nightly at `BACKUP_HOUR` (default
  22:00) via `BACKUP_CHECK_MINUTES` (default 15, 0 disables). "Once per day" is
  decided from the log, so a server that was off at 22:00 still backs up when it
  comes back.
- The database is also copied before a schema migration runs
  (`backups/pre-migration`, newest 3 kept). Only genuine upgrades are copied — a
  fresh database has nothing to lose, which keeps first-run startup silent.
  `backups/pre-update`, written by the installer and the updater, is left alone.
- Local backups live in `C:\ProgramData\SchoolCBT\backups`, beside `data\`, which is
  where the installer and the update helper already write (CBT-04 section 6.1).
- Console API: `GET /api/v1/console/backups` (every local, pre-update,
  pre-migration, pre-restore and second-location file with size and checksum),
  `POST /api/v1/console/backup/now`, `GET /api/v1/console/restore` (candidates,
  what blocks a restore, the last result) and `POST /api/v1/console/restore`.
- A restore verifies the source is a `.db` inside a backup folder (a USB copy is
  refused until it is copied into `backups\`, which stops a stray path from
  overwriting the database), is refused with `CONFLICT` while a sitting is `open`
  or starts within two hours, then writes `backups/SchoolCBT-Restore.cmd` and asks
  for elevation on it — the same consent model as an update, because the service
  runs as `LocalService`.
- `tools/restore-backup.ps1` checks the file really is a SQLite database, stops the
  service, takes a safety copy into `backups/pre-restore` (newest 3 kept), removes
  the `-wal`/`-shm` sidecars, puts the backup in place, restarts and polls
  `/api/v1/exam/status` for 60 seconds, rolling back to the safety copy if the
  server does not come back. It reports `restored` or `restore_failed` in
  `backups/last-restore.json`, which the status endpoint reads back.
- `GET /health` now carries a `backup` check (missing/failed is an error, older
  than 48 hours is degraded, matching the CBT-01 flags) and `GET /health/details`
  reports `databaseIntegrity` from `PRAGMA integrity_check`; both feed the
  heartbeat's `last_backup_*` fields.
- The operator recovery guide is `docs/runbooks/recovery.md`: restores from the
  local folder, the second location and a USB copy, replacing a dead PC, a corrupt
  database, a failed update and the pre-exam checks.
- Covered by `backup.service.spec.ts` (checksums, second location, pruning,
  listing, the sitting rules, elevation refusal, bad sources, the nightly timer)
  and `backup.e2e.spec.ts` (routes, backup-after-close, the guard, a restore
  between sittings).
- **Deferred:** the cloud backup upload/download (API spec 13.9) and the restore
  drill on a Windows VM.

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
