# Document Reading Guide

## Quick Reference for Understanding the CBT School Project

## Essential Documents (Read in This Order)

### 1. Start Here: docs/NEW-SESSION-START.md
**Purpose:** Complete prompt to give to AI in a new session
**When to read:** Before starting a new session
**What you'll learn:** Everything needed to resume work quickly

### 2. docs/QUICK-START.md
**Purpose:** Quick start guide for resuming work
**When to read:** First thing in a new session
**What you'll learn:**
- Where you left off (Phase 6A complete)
- How to verify current state (commands to run)
- Step-by-step Phase 6B implementation guide
- Common issues and solutions
- Estimated timeline

### 3. docs/IMPLEMENTATION-PROGRESS.md
**Purpose:** Overall project progress tracking
**When to read:** To understand what's been done and what's left
**What you'll learn:**
- Status of all phases (0-6A complete, 6B and 6C remaining)
- Detailed breakdown of each completed phase
- Technical patterns established
- File structure overview
- Known limitations and TODOs

### 4. docs/TECHNICAL-REFERENCE.md
**Purpose:** Implementation patterns and code style
**When to read:** Before writing any code
**What you'll learn:**
- Repository pattern (interface + Drizzle implementation)
- Audit logging pattern (always use actorUserId)
- Authorization pattern (CASL, guards)
- State management patterns
- Testing pattern (Vitest, vi.fn())
- Service layer pattern
- Controller pattern
- Module pattern
- Common imports
- Code style guidelines

### 5. docs/CBT-Phase-6-ExamEngine.md
**Purpose:** Detailed specification for Phase 6
**When to read:** Before implementing Phase 6B or 6C
**What you'll learn:**
- Phase 6A requirements (exam management) - COMPLETED
- Phase 6B requirements (pack generation) - NEXT
- Phase 6C requirements (school server delivery) - LATER
- Technical specifications for each sub-phase

## Supplementary Documents (Read as Needed)

### docs/CBT-Database-Architecture.md
**Purpose:** Complete database schema design
**When to read:** When adding new tables or understanding relationships
**What you'll learn:**
- All tables and their columns
- Foreign key relationships
- Indexes and constraints
- Cloud vs school server schema differences

### docs/CBT-Build-Phases-Overview.md
**Purpose:** High-level overview of all build phases
**When to read:** To understand the overall project roadmap
**What you'll learn:**
- Timeline of all phases
- Dependencies between phases
- Risk levels

### docs/CBT-Backend-Architecture.md
**Purpose:** Backend architecture overview
**When to read:** To understand the overall system design
**What you'll learn:**
- System components
- Data flow
- Technology choices

## Phase-Specific Documents (Read as Needed)

### docs/CBT-Phase-0-Foundation.md
**Purpose:** Foundation and infrastructure
**Status:** ✅ Complete

### docs/CBT-Phase-1-Infrastructure.md
**Purpose:** Authentication and authorization
**Status:** ✅ Complete

### docs/CBT-Phase-2-Authentication.md
**Purpose:** Data layer and ORM
**Status:** ✅ Complete

### docs/CBT-Phase-3-DataLayer.md
**Purpose:** User management
**Status:** ✅ Complete

### docs/CBT-Phase-4-UserManagement.md
**Purpose:** Question bank (core)
**Status:** ✅ Complete

### docs/CBT-Phase-5-QuestionBank.md
**Purpose:** Question bank (advanced)
**Status:** ✅ Complete

### docs/CBT-Phase-6-ExamEngine.md
**Purpose:** Exam engine (6A complete, 6B next, 6C later)
**Status:** 6A ✅, 6B ⏳, 6C ⏳

### docs/CBT-Phase-7-SchoolServer.md
**Purpose:** School server
**Status:** ⏳ Not started

### docs/CBT-Phase-8-SyncSystem.md
**Purpose:** Synchronization system
**Status:** ⏳ Not started

### docs/CBT-Phase-9-Results.md
**Purpose:** Results and analytics
**Status:** ⏳ Not started

### docs/CBT-Phase-10-Production.md
**Purpose:** Production deployment
**Status:** ⏳ Not started

## Development Documentation

### docs/development/SETUP.md
**Purpose:** Development environment setup
**When to read:** When setting up a new development machine

### docs/development/DEBUGGING.md
**Purpose:** Debugging tips and techniques
**When to read:** When encountering issues

### docs/development/TROUBLESHOOTING.md
**Purpose:** Common issues and solutions
**When to read:** When encountering errors

## Reference Documentation

### docs/questions.md
**Purpose:** Frequently asked questions
**When to read:** When you have general questions

### docs/versions.md
**Purpose:** Version history
**When to read:** When tracking changes over time

## How to Read These Documents Effectively

### For a New Session:
1. Read NEW-SESSION-START.md (use the prompt there)
2. Read QUICK-START.md
3. Skip to "How to Get Up to Speed" section
4. Run verification commands
5. Read Phase 6B section in CBT-Phase-6-ExamEngine.md
6. Read relevant sections in TECHNICAL-REFERENCE.md

### For Understanding Patterns:
1. Read TECHNICAL-REFERENCE.md
2. Find the pattern you need (repository, service, controller, test)
3. Copy the pattern to your code
4. Adapt to your specific use case

### For Understanding Requirements:
1. Read IMPLEMENTATION-PROGRESS.md to see what's done
2. Read the specific phase document (e.g., CBT-Phase-6-ExamEngine.md)
3. Read CBT-Database-Architecture.md for schema details

### For Troubleshooting:
1. Read TROUBLESHOOTING.md
2. Check QUICK-START.md for common issues
3. Review TECHNICAL-REFERENCE.md for pattern issues

## Document Dependencies

Some documents reference others:
- QUICK-START.md → references Phase 6-ExamEngine.md, TECHNICAL-REFERENCE.md
- IMPLEMENTATION-PROGRESS.md → references all phase documents
- TECHNICAL-REFERENCE.md → references Database-Architecture.md
- Phase documents → reference Database-Architecture.md

## Summary

**Must Read (in order):**
1. NEW-SESSION-START.md (for new session prompt)
2. QUICK-START.md (to resume work)
3. TECHNICAL-REFERENCE.md (for coding patterns)
4. CBT-Phase-6-ExamEngine.md (for current phase requirements)

**Read as Needed:**
- IMPLEMENTATION-PROGRESS.md (for overall progress)
- CBT-Database-Architecture.md (for schema details)
- Phase-specific documents (for detailed requirements)
- Development docs (for setup/debugging)
