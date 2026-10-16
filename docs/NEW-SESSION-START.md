# New Session - Context & Onboarding Prompt

## Overview

This is a prompt you can use in a new session to quickly understand the CBT School project context, what has been implemented, and what needs to be done next.

---

## Copy This Prompt to Start a New Session

```
I'm working on the CBT School backend project. Here's the context:

## Project Location
- Workspace: C:\Users\USER\Desktop\Projects\CBT-School

## What is CBT School?
A computer-based testing platform for students taking exams on lab PCs against an offline-capable local school server, while teachers, administrators, parents, and platform owners use cloud portals. The system supports rosters, exam content, and results synchronization between the school server and cloud when connectivity is available.

## Current Implementation Status

### Completed Phases (Phases 0-6A):
✅ Phase 0: Foundation & Infrastructure (Turborepo, TypeScript, build tooling)
✅ Phase 1: Authentication & Authorization (password hashing, sessions, 2FA, RBAC, CASL, audit logging)
✅ Phase 2: Data Layer & ORM (Drizzle ORM, PostgreSQL for cloud, SQLite for school server)
✅ Phase 3: User Management (students, guardians, invitations, student codes)
✅ Phase 4: Question Bank - Core (subjects, levels, 5 question types, search, approval, versioning)
✅ Phase 5: Question Bank - Advanced (2 more question types, media management, import/export, bulk operations)
✅ Phase 6A: Cloud Exam Management (classes, exams, sittings, exam builder, scheduler)

### Current Phase:
Phase 6A (Cloud Exam Management) is COMPLETE ✅
- All tests passing (185 passed, 2 skipped)
- Typecheck passing (11 tasks)
- Build successful (9 tasks)
- Last commit: feat: implement phases 3-5 and enable modules in main app (479d43f)

### Next Phase:
Phase 6B: Deterministic Pack Generation & Validation (NOT STARTED)

## Key Technical Stack
- TypeScript, NestJS
- Drizzle ORM with PostgreSQL (cloud) and SQLite (school server)
- Vitest for testing
- Turborepo for monorepo management
- CASL for authorization
- argon2 for password hashing
- exam-core package for shared utilities (shuffle, crypto, marking, student codes)

## Architecture
- Monorepo with packages: cloud-api, school-server, shared-types, exam-core, ui, etc.
- Cloud API: PostgreSQL-based, handles admin/teacher operations
- School Server: SQLite-based, offline-capable, handles exam delivery
- Shared types: Database schema and common types
- exam-core: Shared utilities (shuffle, crypto, marking, student codes)

## Documentation Available

The project has comprehensive documentation in the docs/ folder. START HERE:

1. **docs/QUICK-START.md** - ⭐ START HERE
   - Where I left off
   - How to resume work
   - Step-by-step guide for Phase 6B
   - Common issues and solutions

2. **docs/IMPLEMENTATION-PROGRESS.md**
   - Complete breakdown of all completed phases
   - Technical patterns established
   - File structure overview
   - Remaining phases and requirements

3. **docs/TECHNICAL-REFERENCE.md**
   - Repository pattern (interface + Drizzle implementation)
   - Audit logging pattern (always use actorUserId)
   - Authorization pattern (CASL, guards)
   - State management patterns
   - Testing pattern (Vitest, vi.fn())
   - Code style guidelines
   - Common imports and file naming

4. **docs/CBT-Phase-6-ExamEngine.md**
   - Detailed specification for Phase 6 (all sub-phases: 6A, 6B, 6C)
   - Requirements for pack generation, signing, and validation

5. **docs/CBT-Database-Architecture.md**
   - Complete database schema design
   - Table relationships
   - Indexes and constraints

## How to Get Up to Speed (Step-by-Step)

### Step 1: Read the Quick Start Guide
Read: docs/QUICK-START.md
This will tell you exactly where we left off and what to do next.

### Step 2: Verify Current State
Run these commands to ensure everything is working:
```bash
cd C:\Users\USER\Desktop\Projects\CBT-School
pnpm typecheck
pnpm test
pnpm build
```

All should pass.

### Step 3: Review Phase 6B Requirements
Read: docs/CBT-Phase-6-ExamEngine.md
Focus on the Phase 6B section (pack generation and validation).

### Step 4: Understand Technical Patterns
Read: docs/TECHNICAL-REFERENCE.md
This shows you how to implement services, repositories, controllers, and tests following the established patterns.

### Step 5: Review What Was Implemented in Phase 6A
Read: docs/IMPLEMENTATION-PROGRESS.md
Look at the Phase 6A section to understand the exam management foundation.

## What to Implement Next (Phase 6B)

Phase 6B: Deterministic Pack Generation & Validation

Key Requirements:
1. Create ExamPackService for pack generation
2. Implement deterministic pack generation (same config = same pack)
3. Use exam-core's shuffle utilities for deterministic question/option ordering
4. Include manifest, questions, assets, encrypted answer keys
5. Sign packs cryptographically with school's private key
6. Validate pack signatures and contents
7. Write determinism and validation tests

Files to Create/Modify:
- apps/cloud-api/src/modules/exams/exam-pack.service.ts (new)
- apps/cloud-api/src/modules/exams/exams.controller.ts (add pack endpoints)
- apps/cloud-api/src/modules/exams/exams.module.ts (add ExamPackService)
- apps/cloud-api/src/modules/exams/exam-pack.service.spec.ts (new tests)

## Important Patterns to Follow

**For Services:**
- Inject repositories with optional dependencies
- Use non-null assertions (!) after null checks
- Include schoolId and actorUserId in all mutation methods
- Check school ownership before operations
- Log audit events with actorUserId
- Throw NotFoundException for missing resources
- Throw ConflictException for state violations

**For Tests:**
- Use vi.fn() from Vitest, not jest.fn()
- Use vi.mocked() for typed mocks
- Follow AAA pattern (Arrange, Act, Assert)
- Mock repositories as unknown with interface type

**For Audit Logging:**
- Always use actorUserId, never userId
- Event naming: resource.action (e.g., pack.generated, pack.validated)
- Include schoolId, targetId, targetType, and detail

**For Database:**
- Import schema from @cbt/shared-types
- Import DrizzleDB from local drizzle.service.ts
- Never import from @cbt/shared-types/db (doesn't exist)

## Common Gotchas

1. Typecheck error "Cannot find module '@cbt/shared-types/db'" → Import from @cbt/shared-types directly
2. Test error "jest is not defined" → Use vi.fn() from Vitest
3. Audit error "userId is not defined" → Use actorUserId in audit payload
4. Module fails in E2E tests → Use conditional loading based on DATABASE_URL
5. Guard import errors → Guards are in modules/auth/guards/, not modules/auth/abilities/

## Verification Commands

Always run these after implementing:
```bash
pnpm typecheck  # Typecheck all packages
pnpm test       # Run all tests
pnpm build      # Build all packages
```

## Current Git Status

Last commit: feat: implement phases 3-5 and enable modules in main app (479d43f)
Files changed: 85 files (14,632 insertions, 26 deletions)

## File Structure Reference

Key directories:
- apps/cloud-api/src/modules/exams/ - Phase 6A exam management (complete)
- apps/cloud-api/src/modules/questions/ - Phase 5 question bank (complete)
- apps/cloud-api/src/modules/users/ - Phase 3 user management (complete)
- apps/cloud-api/src/modules/auth/ - Phase 1 authentication (complete)
- packages/shared-types/src/db/schema.ts - Shared PostgreSQL schema
- packages/exam-core/src/ - Shared utilities (shuffle, crypto, marking)

## Ask for Help When

- You encounter TypeScript errors that don't match the patterns in TECHNICAL-REFERENCE.md
- Test failures are unclear or unexpected
- You need clarification on Phase 6B requirements
- You're unsure about pack structure or signing approach

---

Please read docs/QUICK-START.md first, then proceed with Phase 6B implementation following the patterns in docs/TECHNICAL-REFERENCE.md.
```

---

## How to Use This Prompt

1. In a new session, copy the entire prompt above (from "I'm working on..." to the end)
2. Paste it into the chat
3. The AI will understand the context and be ready to help you continue with Phase 6B

## Alternative: Just the Essentials

If you want a shorter version, here's the minimal prompt:

```
I'm working on CBT School backend at C:\Users\USER\Desktop\Projects\CBT-School.

Phase 6A (Cloud Exam Management) is complete. Next is Phase 6B (Deterministic Pack Generation & Validation).

Read docs/QUICK-START.md to understand where we left off and what to do next.
Read docs/TECHNICAL-REFERENCE.md for implementation patterns.
Read docs/CBT-Phase-6-ExamEngine.md for Phase 6B requirements.

Phase 6B needs: ExamPackService, deterministic pack generation, cryptographic signing, validation, and tests.

Current verification status: typecheck ✅, tests ✅ (185 passed), build ✅.

Please help me implement Phase 6B.
```
