# New Session - Context & Onboarding Prompt

## Overview

This is a prompt you can use in a new session to quickly understand the CBT School
project context, what has been implemented, and what needs to be done next.

It is the single source of truth for "where did I stop". `QUICK-START.md` covers the
same ground in more detail; `IMPLEMENTATION-PROGRESS.md` is the per-phase ledger.

---

## Copy This Prompt to Start a New Session

```
I'm working on the CBT School backend project. Here's the context:

## Project Location
- Workspace: C:\Users\USER\Desktop\Projects\CBT-School

## What is CBT School?
A computer-based testing platform: students sit exams on lab PCs against an
offline-capable local school server, while teachers, administrators, parents and
platform owners use cloud portals. Rosters, exam content, packs and results sync
between the school server and the cloud when connectivity is available.

## Current Implementation Status

### Completed (Phases 0 - 6C):
✅ Phase 0: Foundation & Infrastructure (Turborepo, TypeScript, build tooling)
✅ Phase 1: Authentication & Authorization (argon2, sessions, CSRF, 2FA/OTP, RBAC,
   CASL, audit logging, password reset, rate limiting, lockout)
✅ Phase 2: Data Layer & ORM (Drizzle: PostgreSQL for cloud, SQLite for school)
✅ Phase 3: User Management (students, guardians, guardianships, invitations,
   student codes)
✅ Phase 4: Question Bank - Core (subjects, levels, 5 question types, search,
   approval workflow, versioning)
✅ Phase 5: Question Bank - Advanced (matching + ordering, media, import/export,
   bulk operations, GIN indexes)
✅ Phase 6A: Cloud Exam Management (classes, exams, sittings, exam builder,
   scheduler, authorization, audit)
✅ Phase 6B: Deterministic Pack Generation & Validation (canonical JSON, store-only
   ZIP, questions.json / keys.enc, Ed25519-signed .cbtpack, verifyPack with named
   failures, cloud pack endpoints)
✅ Phase 6C: School Server Exam Delivery (Section 4.2 SQLite schema, pack import,
   Section 16 student exam API, server-side expiry sweep)

### What is NOT done yet (this is the work that remains):
1. Section 16.10 of the API spec: GET /assets/:asset_id and POST /events
   (integrity signals; needs a session_events table).
2. Section 17 invigilator console API: PIN sign-in (meta.console_pin_hash),
   overview/readiness, open/close sittings (writes sitting.opened / sitting.closed
   to the outbox).
3. Section 13 cloud sync agent: push the school outbox to the cloud
   (POST /sync/v1/results) and pull roster + packs. This is the biggest blocker -
   until it exists, school results stay local.
4. Phase 9: results and analytics on the cloud.
5. Phase 10: production hardening. Known gap: cloud behaviour has never been
   proven against a real PostgreSQL database (tests use mocks/fakes).

## Verification Status (verified at commit bb77c64)
✅ Typecheck: 11 tasks successful
✅ Tests: exam-core 104 passed; school-server 47 passed; cloud-api 203 passed, 2 skipped
✅ Build: 9 tasks successful
✅ Runtime smoke test: `node dist/main.js` maps every Section 16 route, applies the
   schema migration on startup and answers GET /api/v1/exam/status with 200

## Recent Commits
- bb77c64 feat: implement phase 6C school-server exam delivery
- bc4a6d4 fix: resolve Nest dependency injection for users, questions and exams modules
- f595c24 feat: phase 6a/6b exam management and deterministic pack generation
- 479d43f feat: implement phases 3-5 and enable modules in main app

Nothing has been pushed to a remote.

## Key Technical Stack
- TypeScript, NestJS, Drizzle ORM (PostgreSQL cloud / SQLite school), Vitest,
  Turborepo, CASL, argon2, zod, pino, better-sqlite3.

## Architecture
- apps/cloud-api        - PostgreSQL admin/teacher platform
- apps/school-server    - SQLite, offline exam delivery (exam API today)
- packages/shared-types - shared PostgreSQL schema + shared types/error catalogue
- packages/exam-core    - pure deterministic algorithms shared by both: shuffling,
  crypto, marking, student codes, and the .cbtpack reader/builder/validator
- apps/cloud-web, apps/exam-client, apps/installer - front-ends/scaffolds

## Documentation Available

1. docs/QUICK-START.md - where I left off, how to resume, next steps
2. docs/IMPLEMENTATION-PROGRESS.md - per-phase ledger and remaining work
3. docs/TECHNICAL-REFERENCE.md - implementation patterns to follow
4. docs/DOCUMENT-READING-GUIDE.md - how the docs fit together
5. docs/CBT-03-API-and-Sync-Specification.md - authoritative API contract
   (Section 14 packs, Section 15 sync, Section 16 exam API, Section 17 console)
6. docs/CBT-Database-Architecture.md - authoritative schema (Section 4.2 school)

## How to Get Up to Speed (Step-by-Step)

### Step 1: Verify Current State
cd C:\Users\USER\Desktop\Projects\CBT-School
pnpm typecheck
pnpm test
pnpm build
All three should pass with the numbers above.

### Step 2: Read the Quick Start + Progress Ledger
docs/QUICK-START.md and docs/IMPLEMENTATION-PROGRESS.md.

### Step 3: Review Patterns Before Coding
docs/TECHNICAL-REFERENCE.md. Note the school-server difference: repositories are
bound to interface tokens (META_REPOSITORY, CATALOG_REPOSITORY, PACK_REPOSITORY,
SESSION_REPOSITORY, OUTBOX_REPOSITORY) inside ExamModule.

### Step 4: Read the Spec for Whatever You Pick Next
docs/CBT-03-API-and-Sync-Specification.md Sections 13/16.10/17, then
docs/CBT-Database-Architecture.md for any new tables.

## What to Implement Next (pick one)

Option A - Section 17 invigilator console API (self-contained, school server only):
- PIN sign-in using meta.console_pin_hash
- Overview / readiness endpoints
- Open and close sittings, writing sitting.opened / sitting.closed to the outbox

Option B - Section 13 sync agent (unblocks the school -> cloud boundary):
- Push outbox events to the cloud POST /sync/v1/results
- Pull roster and packs, acknowledge delivered events
- Replace the local pack-key storage in meta (pack_key:<pack_id>) with the
  device-key wrapping described in spec 13.6

Option C - Section 16.10 asset + integrity event endpoints (small).

## Important Patterns to Follow

For Services:
- Inject repositories via interface tokens (school server) or @Optional() @Inject(...)
  tokens (cloud), never a raw Drizzle handle
- Include schoolId and actorUserId in all mutation methods; audit with actorUserId
- Check ownership before operations; NotFoundException / ConflictException for errors

For Tests:
- Vitest: vi.fn(), vi.mocked(); no jest
- School-server flows: seed reference rows directly through Drizzle into a temp
  SQLite database (see modules/exam/exam.e2e.spec.ts)

For Database:
- Cloud schema: import from @cbt/shared-types
- School schema: app-local (apps/school-server/src/shared/database/schema.ts)
- School migrations run automatically on startup; `build` copies the migrations
  folder into dist. Hand-written migrations need a matching meta snapshot.

For Determinism:
- Pack/session behaviour must be reproducible: same inputs -> same bytes/order.
  All ordering, shuffling, signing and marking come from @cbt/exam-core.

## Common Gotchas

1. "Cannot find module '@cbt/shared-types/db'" -> import from @cbt/shared-types
2. "jest is not defined" -> use vi.fn()
3. audit "userId is not defined" -> use actorUserId
4. A new workspace dependency needs `pnpm install` before its symlink exists
5. exam-core changes must be rebuilt (`pnpm --filter @cbt/exam-core build`) before
   downstream packages can see the new types
6. better-sqlite3 Drizzle transactions are synchronous: use
   db.transaction((tx) => { ...tx.insert(...).run(); })
7. The school `sessions` table is exam sessions; staff sign-in is `auth_sessions`
8. Pack signing uses the CLOUD Ed25519 key (PACK_SIGNING_PRIVATE_KEY /
   PACK_SIGNING_KEY_ID), not a per-school key

## Verification Commands

pnpm typecheck
pnpm test
pnpm build
Plus, after touching the school server: pnpm --filter @cbt/school-server build and a
smoke test of `node dist/main.js`.

---

Start by reading docs/QUICK-START.md, then confirm the verification numbers above,
then tell me which of Options A/B/C to begin.
```

---

## How to Use This Prompt

1. In a new session, copy the prompt above (from "I'm working on..." to the end).
2. Paste it into the chat.
3. The AI will verify the state and be ready to continue.

## Alternative: Just the Essentials

```
I'm working on CBT School backend at C:\Users\USER\Desktop\Projects\CBT-School.

Phases 0 through 6C are complete (commit bb77c64): 6A cloud exam management,
6B deterministic pack generation/validation, 6C school-server exam delivery
(Section 4.2 SQLite schema + Section 16 student exam API).

Remaining: Section 17 invigilator console API, Section 13 school<->cloud sync
agent, Section 16.10 assets/integrity events, then Phase 9 results and Phase 10
production hardening (no real PostgreSQL verification yet).

Read docs/QUICK-START.md for where we left off, docs/IMPLEMENTATION-PROGRESS.md for
the ledger, and docs/TECHNICAL-REFERENCE.md for patterns.

Current verification: typecheck 11/11, build 9/9, tests exam-core 104 /
school-server 47 / cloud-api 203 (+2 skipped).

Please confirm the state and help me continue.
```
