# CBT School - Quick Start Guide

## Where I Left Off

**Current Phase:** Phase 6B (Deterministic Pack Generation & Validation) - COMPLETED ✅
**Last Commit:** feat: implement phases 3-5 and enable modules in main app (commit 479d43f) + Phase 6B changes (uncommitted)
**Next Phase:** Phase 6C (School Server Exam Delivery)

## What Was Just Completed

Phase 6B added deterministic exam pack generation and validation:

- `packages/exam-core/src/packs/`: canonical JSON, deterministic ZIP, `questions.json` /
  `keys.enc` builders, `buildPack`, `verifyPack` (named failures per CBT-03 §14)
- `apps/cloud-api/src/modules/exams/`: `ExamPackRepository`, `PackSourceRepository`,
  `PackStore`, `ExamPackService`, `PacksController`, exam `publish`/`packs` endpoints
- Real signed `.cbtpack` ZIPs: AES-256-GCM `keys.enc`, Ed25519 signature over
  `SHA-256(manifest.json bytes)`
- 14 new exam-core tests + 15 new cloud-api tests

**Verification Status**

✅ Typecheck: 11 tasks successful
✅ Tests: exam-core 81 passed; cloud-api 200 passed, 2 skipped
✅ Build: 9 tasks successful

## How to Resume Work

### 1. Start the Development Server

```bash
cd C:\Users\USER\Desktop\Projects\CBT-School
pnpm --filter @cbt/cloud-api dev
```

### 2. Run Tests to Verify Current State

```bash
pnpm test
```

Expected: exam-core 81 passed; cloud-api 200 passed, 2 skipped

### 3. Check Typecheck

```bash
pnpm typecheck
```

Expected: All 11 tasks successful

### 4. Review the Phase 6B Deliverables

- `packages/exam-core/src/packs/` - canonical JSON, ZIP, `buildPack`, `verifyPack`
- `apps/cloud-api/src/modules/exams/exam-pack.service.ts` - pack service
- `apps/cloud-api/src/modules/exams/packs.controller.ts` - pack endpoints

Read `docs/CBT-03-API-and-Sync-Specification.md` section 14 for the pack format.

## Next Steps: Phase 6C (School Server Exam Delivery)

Phase 6B is complete. Next is Phase 6C:

1. Extend the school-server SQLite schema with sessions, answers and seats tables
2. Implement `ExamSessionService`, `AutoSaveService` and navigation
3. Load and verify packs on the school server with `verifyPack` from `@cbt/exam-core`
4. Implement session recovery, debounced saves and backoff
5. End-to-end lifecycle tests

**Known gap to fix first:** the `users`, `questions` and `exams` modules declare
repository-interface constructor parameters without `@Inject` tokens and use
repositories that take a raw `DrizzleDB`, so they do not boot when `DATABASE_URL`
is set. Follow the auth module pattern (inject `DrizzleService`, expose repositories
through tokens).

## Reference Implementation Patterns

Use existing Phase 6A code as reference:
- Service pattern from `exams.service.ts`
- Repository pattern from `repositories/exam.repository.ts`
- Controller pattern from `exams.controller.ts`
- Test pattern from `exams.service.spec.ts`

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

Before starting Phase 6B, ensure the current state is committed:

```bash
git status
git add .
git commit -m "feat: implement phase 6A cloud exam management"
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
- If you need clarification on Phase 6B requirements
- If you're unsure about pack structure or signing approach

## Estimated Timeline

Phase 6B: 3-4 days
- Day 1: Service implementation and deterministic generation
- Day 2: Cryptographic signing and validation
- Day 3: Pack endpoints and tests
- Day 4: Verification and documentation

Good luck with Phase 6B! 🚀
