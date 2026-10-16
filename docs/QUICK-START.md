# CBT School - Quick Start Guide

## Where I Left Off

**Current Phase:** Phase 6C (School Server Exam Delivery) - COMPLETED ✅
**Last Commit:** `feat: implement phases 3-5 and enable modules in main app (479d43f)` → `fix: resolve Nest dependency injection (bc4a6d4)` → `feat: phase 6A exam management + 6B pack generation (f595c24)` + Phase 6C changes
**Next Phase:** Phase 6C remaining (section 17 console API, section 13 sync agent, section 16.10 assets/events)

## What Was Just Completed

Phase 6C delivered the school-server student exam API (CBT-03 section 16):

- School-server SQLite schema now implements CBT-Database-Architecture section 4.2
  (`sessions`, `answers`, `results`, `outbox`, `students`, `packs`, `sittings`, …).
  The old staff table was renamed to `auth_sessions` (migration `0001_exam_delivery`).
  `DrizzleSqliteService` applies migrations on startup.
- `apps/school-server/src/modules/exam/`: `PackImportService` (verify + store packs),
  `TicketService`, `ExamSessionService`, `SessionExpiryService`,
  `LoginThrottleService`, `SessionTokenGuard`, `ExamController`
  (`/api/v1/exam/status|login|start|session|session/answers|ping|session/submit`).
- `packages/exam-core/src/packs/`: `readPack`, `markPackSession`,
  `prepareSessionQuestions` so pack semantics are not duplicated.
- 23 new exam-core tests, 33 new school-server tests.

**Verification Status**

✅ Typecheck: 11 tasks successful
✅ Tests: exam-core 104 passed; school-server 47 passed; cloud-api 203 passed, 2 skipped
✅ Build: 9 tasks successful
✅ Runtime smoke test: `node dist/main.js` maps every section 16 route and
   `GET /api/v1/exam/status` returns 200

## How to Resume Work

### 1. Start the Development Server

```bash
cd C:\Users\USER\Desktop\Projects\CBT-School
pnpm --filter @cbt/cloud-api dev
# or the school server
pnpm --filter @cbt/school-server dev
```

### 2. Run Tests to Verify Current State

```bash
pnpm test
```

Expected: exam-core 104 passed; school-server 47 passed; cloud-api 203 passed, 2 skipped

### 3. Check Typecheck

```bash
pnpm typecheck
```

Expected: All 11 tasks successful

### 4. Review the Phase 6C Deliverables

- `apps/school-server/src/modules/exam/` - the whole exam delivery module
- `apps/school-server/src/shared/database/schema.ts` - section 4.2 schema
- `packages/exam-core/src/packs/pack-reader.ts`, `pack-marking.ts`, `pack-shuffle.ts`

Read `docs/CBT-03-API-and-Sync-Specification.md` section 16 for the exam API.

## Next Steps: Remaining Phase 6C Work

1. Section 17 console API: PIN sign-in (`meta.console_pin_hash`), overview/readiness,
   open/close sittings (writes `sitting.opened` / `sitting.closed` to `outbox`)
2. Section 16.10: `GET /assets/:asset_id` (session-scoped pack assets) and
   `POST /events` (integrity signals; needs `session_events`)
3. Section 13 sync agent: push `outbox` to the cloud `POST /sync/v1/results`
4. Phase 8: replace the local pack-key storage in `meta` (`pack_key:<pack_id>`) with
   device-key wrapping (spec 13.6)

**Repository DI:** fixed. Every Drizzle repository injects `DrizzleService` (never a
raw `DrizzleDB`), the `users`/`questions`/`exams` services declare repository
parameters with `@Optional() @Inject(Drizzle*Repository)`, and those modules import
`AuthModule` for `AuditService` and the guard dependencies. Verified by
`app.database.module.spec.ts`, which boots the whole graph with `DATABASE_URL` set.
The school server binds its repositories through interface tokens in `ExamModule`.

## Reference Implementation Patterns

Cloud API (Phase 6A/6B):
- Service pattern from `exams.service.ts`
- Repository pattern from `repositories/exam.repository.ts`
- Controller pattern from `exams.controller.ts`
- Test pattern from `exams.service.spec.ts`

School server (Phase 6C):
- Interface-token repositories from `modules/exam/repositories/`
- Service + guard + controller from `modules/exam/exam-session.service.ts`,
  `guards/session-token.guard.ts`, `exam.controller.ts`
- End-to-end pattern from `modules/exam/exam.e2e.spec.ts`

## Common Issues and Solutions

**Issue:** Typecheck fails with "Cannot find module '@cbt/shared-types/db'"
**Solution:** Import from `@cbt/shared-types` directly, not `@cbt/shared-types/db`

**Issue:** Tests fail with "jest is not defined"
**Solution:** Use `vi.fn()` from Vitest, not `jest.fn()`

**Issue:** Audit logging fails with "userId is not defined"
**Solution:** Use `actorUserId` in audit payload, not `userId`

**Issue:** Module fails to load in E2E tests
**Solution:** Use conditional loading based on `DATABASE_URL` (see existing modules)

## Git Workflow

Before starting new work, ensure the current state is committed:

```bash
git status
git add .
git commit -m "feat: implement phase 6C school-server exam delivery"
```

## Helpful Commands

```bash
# View recent commits
git log --oneline -10

# View current branch
git branch

# View uncommitted changes
git diff

# Stash changes if needed
git stash
```

## Documentation Reference

- `docs/IMPLEMENTATION-PROGRESS.md` - Overall progress and phase status
- `docs/TECHNICAL-REFERENCE.md` - Architecture patterns and code style
- `docs/CBT-Phase-6-ExamEngine.md` - Phase 6 specification
- `docs/CBT-Database-Architecture.md` - Database design

## When to Ask for Help

- If you encounter TypeScript errors that don't match the patterns in TECHNICAL-REFERENCE.md
- If test failures are unclear or unexpected
- If you need clarification on the console API or sync requirements
- If you're unsure about pack structure or signing approach

## Estimated Timeline

Phase 6C remaining (console + sync): 3-4 days
- Day 1: Section 17 console PIN sign-in and overview
- Day 2: Open/close sittings and outbox events
- Day 3: Section 13 sync push
- Day 4: Verification and documentation

The student exam API (section 16.2–16.9) and pack import are done. 🚀
