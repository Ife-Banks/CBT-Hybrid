# CBT Platform

A computer-based testing platform for schools. Students write exams on lab PCs
against a **local school server** (works offline); teachers, admins and parents
use cloud portals; results and rosters **sync** between the school and the cloud
whenever the internet is available.

This repository is the implementation. The specifications live in `docs/`.

## Status

**Phase 0 - Foundation** (scaffold, tooling, CI, dev environment, docs).
No business logic yet. See `docs/CBT-Build-Phases-Overview.md` for the roadmap
and `docs/questions.md` for decisions and open items.

## Layout

```
apps/
  cloud-api/      NestJS: REST API, Sync API, background workers
  cloud-web/      Next.js portals: admin, teacher, parent, platform owner (placeholder)
  school-server/  NestJS: Exam API, Console API, WebSocket, sync agent, backups
  exam-client/    React + Vite student client, built to static files (placeholder)
  installer/      Inno Setup + WinSW for the Windows school server (placeholder)
packages/
  exam-core/      Pure TypeScript: student codes, exam keys, shuffle, marking, packs
  shared-types/   Zod schemas, types, error codes, permission names
  ui/             Design tokens and shared React components (placeholder)
  config/         Shared TypeScript configuration
  test-fixtures/  Sample import files, demo data builders, load-test clients
scripts/          Cross-platform Node helper scripts
docs/             Specifications, phase plans, development guides
```

## Prerequisites

- **Node.js 24** (see `.nvmrc`)
- **pnpm 12** (`npm install -g pnpm@12` or `corepack enable`)
- A **Neon** Postgres, **Upstash** Redis and **Cloudflare R2** account for
  development (no local Docker required). See `docs/development/SETUP.md`.

## Quick start

```bash
pnpm install
pnpm dev:setup     # create .env from .env.example and check required values
pnpm dev           # start all apps
pnpm verify        # lint + typecheck + test + build + offline check
```

Health checks: cloud-api `http://localhost:3000/health`,
school-server `http://localhost:8080/health`.

## Scripts

| Command                                                   | Does                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`                                                | Runs every app's dev server (Turborepo)                                  |
| `pnpm verify`                                             | `lint` + `typecheck` + `test` + `build` + `check:offline` (what CI runs) |
| `pnpm build`                                              | Builds all packages and apps                                             |
| `pnpm lint` / `pnpm typecheck` / `pnpm test`              | Single checks                                                            |
| `pnpm format` / `pnpm format:check`                       | Prettier                                                                 |
| `pnpm check:offline`                                      | Fails if built exam client/web reference an external URL                 |
| `pnpm dev:setup` / `dev:start` / `dev:clean` / `dev:logs` | Dev environment helpers                                                  |

## Documentation

- `docs/CBT-Build-Phases-Overview.md` - roadmap and phases (source of truth for order of work)
- `docs/CBT-Phase-0-Foundation.md` ... `Phase-10-Production.md` - per-phase plans
- `docs/CBT-01-Product-Requirements.md` onwards - the specification set
- `docs/development/` - setup, debugging, troubleshooting
- `docs/questions.md` - conflicts, decisions, open questions
- `docs/versions.md` - exact tool versions
