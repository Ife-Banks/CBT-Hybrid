# CBT Platform: 04 Build Specification (for the coding agent)

Version 1.0 · 11 October 2026 · Status: draft for review

This document tells a coding agent (and you) **how to build the platform, in what order, and how to prove each step works**. It does not repeat the other documents. It points into them.

| Document | Role in the build |
|---|---|
| `CBT-Technical-Design.md` | Architecture and decisions. Do not change them without asking |
| `CBT-01-Product-Requirements.md` | Behaviour. `US-` stories and `BR-` rules are the acceptance source |
| `CBT-02-Data-Model.md` | Tables and constraints |
| `CBT-03-API-and-Sync-Specification.md` | Endpoints, wire formats, pack format, marking rules |
| **`CBT-04-Build-Specification.md` (this file)** | Order of work, conventions, tests, ready-to-paste prompts |
| `CBT-05-Site-Survey-Checklist.md` | What to check at the school before and during install |

---

## Contents

1. [How to use this specification](#1-how-to-use-this-specification)
2. [Repository, tooling and conventions](#2-repository-tooling-and-conventions)
3. [Cross-cutting building blocks](#3-cross-cutting-building-blocks)
4. [Student codes, exam keys, seeds and test vectors](#4-student-codes-exam-keys-seeds-and-test-vectors)
5. [Milestones](#5-milestones)
6. [Windows service and installer](#6-windows-service-and-installer)
7. [Testing requirements](#7-testing-requirements)
8. [Definition of done and review checklist](#8-definition-of-done-and-review-checklist)
9. [Import templates](#9-import-templates)
10. [Notification templates](#10-notification-templates)
11. [Configuration and environment variables](#11-configuration-and-environment-variables)
12. [Seed data and demo fixtures](#12-seed-data-and-demo-fixtures)
13. [Prompts for the coding agent](#13-prompts-for-the-coding-agent)
14. [Non-negotiables and when to ask a human](#14-non-negotiables-and-when-to-ask-a-human)

---

## 1. How to use this specification

### 1.1 Reading order

Technical Design, then PRD, Data Model, API and Sync, then this file. Before starting a milestone, read the sections it lists under **Read first**.

### 1.2 Which document wins

| Question | Source of truth |
|---|---|
| What the system does and for whom | PRD |
| Architecture, where things run, who owns what data | Technical Design |
| Table and column definitions, constraints, indexes | Data Model |
| Endpoint paths, request and response shapes, error codes, pack and sync formats, marking rules | API and Sync Specification |
| Order of work, conventions, tests, test vectors, templates | This file |

If two documents disagree, use the row above. Then write the conflict into `docs/questions.md` (what, where, what you chose) and carry on with the safest choice. Do not stop the milestone for it.

### 1.3 Working rules for the agent

1. Work **one milestone at a time**, in the order in section 5. Do not start milestone N+1 until N's acceptance tests pass.
2. **Tests before or with code** for everything in `packages/exam-core`, authentication, permissions, sync and marking. Those areas must not ship without tests.
3. Every milestone ends with: code, migrations, tests, updated docs (`docs/`), and a short demo script (`docs/demo/Mx.md`) a human can follow to see it work.
4. Never invent endpoints, tables or fields that are in the documents under a different name. If you need one that is missing, add it to the document in the same pull request and flag it.
5. Run `pnpm verify` before saying anything is done (section 2.4).
6. Keep pull requests small: one concern each, at most about 800 changed lines, with a description that names the `US-` stories it covers.
7. No secrets in the repository. No real student data in fixtures. No network calls from the school server or the exam client except to the cloud sync endpoints (section 14).
8. When a rule says "must", a failing test must exist that fails without it.

---

## 2. Repository, tooling and conventions

### 2.1 Layout

```
/
├─ apps/
│  ├─ cloud-web/       Next.js App Router: admin, teacher, parent, platform-owner portals
│  ├─ cloud-api/       NestJS: REST API, Sync API, background workers (worker entry point)
│  ├─ exam-client/     React + Vite, built to static files, served by school-server
│  ├─ school-server/   NestJS: Exam API, Console API, WebSocket, sync agent, backups, console web page
│  └─ installer/       Inno Setup script, WinSW config, build scripts for the Windows installer
├─ packages/
│  ├─ exam-core/       Pure TypeScript: marking, shuffle, student codes, pack format, crypto helpers
│  ├─ shared-types/    Zod schemas, TypeScript types, error codes, permission names
│  ├─ ui/              Design tokens and shared React components
│  ├─ config/          ESLint, TypeScript, Tailwind, Vitest presets
│  └─ test-fixtures/   Sample import files, demo data builders, load-test clients
├─ docs/               The six documents, questions.md, demo scripts, runbooks
├─ docker/             Compose files for local and production cloud
├─ .github/workflows/  CI
├─ pnpm-workspace.yaml, turbo.json, package.json
```

`packages/test-fixtures` is an addition to the layout in the Technical Design (section 3).

### 2.2 Versions and tooling

| Item | Rule |
|---|---|
| Node.js | Current LTS at project start, pinned in `.nvmrc` and the installer. The school server ships its own `node.exe` of the same version |
| Language | TypeScript, `strict: true`, `noUncheckedIndexedAccess: true`. No `any` without a comment explaining why |
| Package manager | pnpm with a committed lockfile. Workspaces |
| Build orchestration | Turborepo |
| Backend | NestJS, Drizzle ORM and drizzle-kit, Zod, pino, argon2, `otplib`, BullMQ, `libphonenumber-js` (default country NG) |
| Frontend | Next.js (App Router) and React, Tailwind CSS, Radix primitives, TanStack Query, KaTeX |
| Exam client | React and Vite. **Build target `chrome109`** (the last Chrome for Windows 7 and 8). Use Tailwind CSS v3 or compile CSS with a Chrome 109 target. Do not use CSS or JavaScript features newer than Chrome 109 (for example `:has()`, container queries, CSS nesting, `structuredClone` polyfill-free is fine, top-level await is not) |
| Tests | Vitest, Playwright, k6, and Supertest for APIs |
| Lint and format | ESLint (typescript-eslint, strict), Prettier. Conventional Commits |
| Versions record | Write the exact versions chosen to `docs/versions.md` at M0 |

### 2.3 Folder conventions inside the apps

```
apps/cloud-api/src/
  main.ts  worker.ts  app.module.ts
  common/        errors, filters, guards, pipes, audit, clock, ids, config
  db/            drizzle schema (Postgres), migrations, rls.sql
  modules/<name>/  <name>.controller.ts  .service.ts  .repository.ts  .dto.ts  .spec.ts
  jobs/          BullMQ processors
  notifications/ adapters and templates
apps/school-server/src/
  main.ts  app.module.ts
  common/  db/ (sqlite schema, migrations)  modules/{exam,console,sync,packs,backup,health}
```

A module's controller only parses input and calls the service. The service holds the rules. The repository is the only place that touches the database and the only place that applies tenant and role scoping to queries.

### 2.4 Scripts that must exist

| Command | What it does |
|---|---|
| `pnpm dev` | Starts Postgres, Redis, MinIO (Docker), cloud-api, worker, cloud-web, and a school-server against a local SQLite file |
| `pnpm verify` | `lint`, `typecheck`, `test`, `build`, and `check:offline` (below). This is what CI runs |
| `pnpm test:perm` | The permission matrix test (section 7.1) |
| `pnpm db:migrate` / `pnpm db:generate` | Cloud migrations |
| `pnpm school:migrate` | School server migrations against a given SQLite file |
| `pnpm seed:demo` | Loads the demo school (section 12) |
| `pnpm loadtest -- --clients 60` | Runs the k6 or Node load test (section 7.4) |
| `pnpm installer:build` | Builds the Windows installer (on a Windows runner) |
| `pnpm check:offline` | Fails if the built exam client or console references any external URL, CDN, font host or analytics (anything except relative paths and `localhost`) |

### 2.5 Continuous integration

| Job | Runs | Fails the build when |
|---|---|---|
| `verify` | `pnpm verify` on Linux | Any step fails |
| `perm-matrix` | `pnpm test:perm` against a real Postgres | Any role/endpoint pair behaves differently from API spec section 19 |
| `e2e` | Playwright against staging compose | A journey in section 7.3 fails |
| `windows-installer` | On `windows-latest`: build the installer, install silently, start the service, run a smoke test, uninstall | Service does not start, port not reachable, or upgrade-over-existing fails |
| `deploy-staging` | On merge to main | Migrations or health check fail |

---

## 3. Cross-cutting building blocks

Build these once in M0 to M2. Every later milestone uses them.

| # | Block | Requirements |
|---|---|---|
| 3.1 | **IDs** | `newId()` returns a UUIDv7 string. The school server uses the same function offline |
| 3.2 | **Clock** | A `Clock` interface (`now()`) injected everywhere. Tests control time. All times UTC ISO-8601 with milliseconds. No call to `Date.now()` in business code |
| 3.3 | **Config** | Each app reads environment variables through a Zod schema at start. It fails fast with a clear list of what is missing. See section 11 |
| 3.4 | **Errors** | `AppError(code, status, detail, errors?)`. One global filter turns any error into `application/problem+json` exactly as API spec 1.4. Codes come from `shared-types/errors.ts`, which mirrors API spec section 2. Unknown exceptions become `INTERNAL` and are logged with the `request_id` |
| 3.5 | **Validation** | Every body, query and path parameter is parsed with a Zod schema from `shared-types`. Controllers never read unvalidated input |
| 3.6 | **Passwords and sessions** | argon2id with at least `m = 19456 KiB, t = 2, p = 1`. Sessions are server-side rows (`sessions` table), the cookie holds a random 32-byte token and the table stores its SHA-256. CSRF double-submit as API spec 1.3. TOTP with `otplib`, 10 recovery codes stored hashed. Lockouts per API spec 1.7 |
| 3.7 | **Roles and scoping** | CASL abilities built per request from the user's role and assignments. Repositories apply scope: `school_id` always; teachers by `class_subjects`; parents by `guardianships` with `can_view_results` and `results.status = 'released'`. A parent asking for a child they cannot see gets `404` |
| 3.8 | **Row-Level Security** | Enable Postgres RLS from the start on every table with `school_id`. Each request's transaction runs `SET LOCAL app.school_id = ...`. The app connects as a non-superuser role. `/platform/*` routes use a separate role that may bypass RLS. This is a second line of defence behind the repositories |
| 3.9 | **Audit** | `audit.log({ actor, action, entity, entity_id, before, after })` writes in the **same transaction** as the change. The application database role has `INSERT` and `SELECT` on `audit_logs` only, never `UPDATE` or `DELETE`. Action names from API spec 11.4 |
| 3.10 | **Jobs** | BullMQ queues: `email`, `sms`, `whatsapp`, `import`, `pack`, `remark`, `notify`, `maintenance`. Handlers are idempotent. Retries with exponential backoff. Failed jobs go to a dead-letter set the Platform Owner can see |
| 3.11 | **Notification adapters** | Interface `send(channel, to, template, vars) -> { provider_ref }`. Implementations: `console` (dev, prints), an email provider (SMTP or API), SMS and WhatsApp providers (chosen later behind the same interface). Spending caps (US-13.3) are enforced before sending. Templates in section 10 |
| 3.12 | **Object storage** | Interface `put`, `get`, `signedUrl`. Implementations: S3-compatible (production, MinIO in dev) and local folder (tests) |
| 3.13 | **Logging** | pino JSON with `request_id`. **Never log** passwords, tokens, OTP codes, student codes, exam keys, wrapped keys, device secrets, or answer content. Redaction list in config |
| 3.14 | **Text** | All user-facing strings live in `messages/en.json` per app (US scope: English only, ready for translation). No sentence is built from fragments |
| 3.15 | **Phone numbers** | One `normalisePhone()` helper using `libphonenumber-js` with default country `NG`. Output E.164. Rejects numbers that are not valid mobile numbers. Test cases in 4.5 |
| 3.16 | **Money** | Not used in the MVP. If added (fees), integer kobo only |

---

## 4. Student codes, exam keys, seeds and test vectors

These are small, exact, and easy to get subtly wrong. Implement them in `packages/exam-core` and use the vectors as unit tests.

### 4.1 Student code

Format: `<SCHOOL>-<BODY8><CHECK>`, for example `GRA-7K2M9QXDG`.

| Part | Rule |
|---|---|
| `SCHOOL` | The school code: 3 to 6 capital letters or digits (API spec 12.1) |
| `BODY8` | 8 characters from the alphabet below, chosen with a cryptographically secure random generator (`crypto.randomInt`) |
| `CHECK` | One character from the same alphabet, computed as below |

Alphabet (31 characters, no `0 1 I L O`): `23456789ABCDEFGHJKMNPQRSTUVWXYZ`

Check character (weighted mod-31 checksum). Let `v(c)` be the index of character `c` in the alphabet (0 to 30). For the 9 characters of body plus check at positions 1 to 9:

```
sum   = Σ over i=1..8 of ( i × v(body[i]) )
check = alphabet[ ( −sum × 7 ) mod 31 ]            // 7 is the inverse of 9 modulo 31
valid = ( Σ over i=1..9 of ( i × v(code[i]) ) ) mod 31 == 0
```

Properties: it detects every single-character error and every swap of two neighbouring characters, and a random wrong string passes about 1 time in 31. Test vectors:

| Body (8) | Check | Full code body |
|---|---|---|
| `7K2M9QXD` | `G` | `7K2M9QXDG` |
| `K7M2P9QX` | `W` | `K7M2P9QXW` |
| `22222222` | `2` | `222222222` |
| `ZZZZZZZZ` | `6` | `ZZZZZZZZ6` |
| `M4R8T2VX` | `Y` | `M4R8T2VXY` |

Must be rejected by `isValidCodeBody`: `7K2M9QXDH` (wrong check), `7K2M9QDXG` (two neighbours swapped), and any string containing `0`, `1`, `I`, `L`, `O`, or lowercase after normalisation. Normalisation: uppercase, remove spaces and hyphens, then the last 9 characters are body plus check and the rest is the school code.

Uniqueness: codes are unique per school and never reused (BR-08). If a generated code collides, generate again.

### 4.2 Exam key

Six digits (`000000` to `999999`, leading zeros allowed) from `crypto.randomInt(0, 1_000_000)`, padded. It must differ from every key currently in use by an open sitting. Store `SHA-256(sitting_id + ":" + key)` hex only, keep the plain key in memory while the sitting is open (API spec 17.3). Compare in constant time.

### 4.3 Shuffle and seed

Implementation must match this exactly (it is what makes a resumed exam show the same order):

```ts
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash32(s: string): number {            // FNV-1a over the UTF-8 bytes
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function shuffle<T>(items: readonly T[], seed: number): T[] {
  const rnd = mulberry32(seed), a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// question order:   shuffle(questions, seed)
// option order:     shuffle(options, (seed ^ hash32(question_id)) >>> 0)
```

Vectors:

| Check | Expected |
|---|---|
| `mulberry32(12345)` first three outputs × 2³² | `4207900869`, `1317490944`, `2079646450` |
| `hash32("q-001")` | `3036902622` |
| `shuffle(['A','B','C','D','E','F','G','H','I','J'], 12345).join('')` | `GEIABHFDCJ` |
| Option seed for question `q-001` with session seed 12345 | `3036890343` |
| `shuffle(['A','B','C','D'], 3036890343).join('')` | `ADBC` |

The session seed is a random unsigned 32-bit integer made with `crypto.randomInt(0, 2**32)` when the session starts.

### 4.4 Sync signing, key wrapping, PIN reset: vectors

Use these with the secret `test-secret-0123456789abcdef0123` (32 ASCII bytes).

| Check | Expected |
|---|---|
| `sha256_hex("")` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Signature for `GET /sync/v1/changes?since=0&limit=500`, timestamp `1760000000`, nonce `AAAAAAAAAAAAAAAAAAAAAA`, empty body. `string_to_sign` is the six lines joined with `\n`: `v1`, `GET`, the path and query, the timestamp, the nonce, `sha256_hex(body)` | `937eb643235c3c13a5a48f6e41558ea5ec8b8e840e261bb52137fbac985ca8de` |
| PIN reset code at unix time `1760000000` (hour counter `488888`, message `pin-reset|488888`) | `13232082` |
| `KEK = HKDF-SHA256(ikm = secret, salt = "pack-1", info = "cbt-pack-key-v1", length = 32)`, hex | `277a3953f4179adeb8b609e602ae910cf446606bdf14238db36eac026ffd7c70` |

### 4.5 Phone normalisation vectors

| Input | Output |
|---|---|
| `08012345678` | `+2348012345678` |
| `+234 801 234 5678` | `+2348012345678` |
| `2348012345678` | `+2348012345678` |
| `0801 234 5678` | `+2348012345678` |
| `12345` | rejected |
| `+14155550100` | accepted as a foreign number if the school allows it, otherwise rejected (default: accepted) |

### 4.6 Marking vectors (`exam-core`)

| Case | Answer | Key | Result |
|---|---|---|---|
| single choice, correct | `{option_id: B}` | correct `[B]`, marks 2 | 2 |
| single choice, wrong | `{option_id: C}` | `[B]` | 0 |
| single choice, unanswered | `null` | `[B]` | 0 |
| multi choice, exact set | `{option_ids: [C, A]}` | `[A, C]`, marks 3 | 3 |
| multi choice, subset | `{option_ids: [A]}` | `[A, C]` | 0 |
| multi choice, extra | `{option_ids: [A, B, C]}` | `[A, C]` | 0 |
| fill blank, case ignored | `{text: "  abuja "}` | `["Abuja"]`, `case_sensitive: false` | full marks |
| fill blank, case matters | `{text: "abuja"}` | `["Abuja"]`, `case_sensitive: true` | 0 |
| fill blank, inner spaces | `{text: "New   York"}` | `["New York"]` | full marks |
| fill blank, other accepted answer | `{text: "FCT"}` | `["Abuja","FCT"]` | full marks |
| `percent` rounding | score 1, max 3 | | `33.33` |
| `percent` rounding half up | score 2, max 3 | | `66.67` |

---

## 5. Milestones

Fourteen milestones. Each has: **Goal**, **Read first**, **Build**, **Acceptance tests**, **Not in this milestone**. Indicative effort is in weeks of focused work for one developer using a coding agent. Milestones overlap where noted, which is how the plan reaches about 23 weeks.

| # | Milestone | Weeks | Depends on |
|---|---|---|---|
| M0 | Scaffold and tooling | 0.5 | none |
| M1 | `exam-core` and `shared-types` | 1.5 | M0 |
| M2 | Cloud foundation: database, tenancy, auth, roles, audit | 2 | M0, M1 |
| M3 | Accounts, invitations, notifications, generic import, people | 2 | M2 |
| M4 | Academic structure, students, student codes | 1.5 | M3 |
| M5 | Question bank, assets, question import | 2 | M3, M4 |
| M6 | Exams, sittings, pack builder, freeze | 2 | M1, M5 |
| M7 | Sync API (cloud), results ingest, review, release, key correction | 2.5 | M6 |
| M8 | Parent Portal | 1.5 | M7 (overlaps M9) |
| M9 | School server core: database, sync agent, pack loader | 2 | M7 |
| M10 | School Exam API and exam client | 2.5 | M9 |
| M11 | Invigilator console and live updates | 1.5 | M10 (overlaps M10) |
| M12 | Windows service, installer, backup, update, restore | 2 | M9 to M11 |
| M13 | Hardening, load and fault tests, pilot readiness | 2 | all |
| M14 | Phase 2: school fees (outline only, do not start) | n/a | M13 |

UI work: each milestone includes the screens for its stories (PRD section 8). Until the designer delivers, use `packages/ui` with plain Tailwind and Radix and keep screens simple. Do not spend time on visual polish before the design system exists.

---

### M0. Scaffold and tooling

**Goal.** An empty but fully wired monorepo that builds, tests and deploys a "hello" in CI.

**Read first.** Section 2, Technical Design 3 and 17.

**Build.**
- The layout in 2.1, workspaces, Turborepo, TypeScript project references, shared ESLint, Prettier, Vitest presets.
- `apps/cloud-api` with `GET /health` returning `{ status, version, db }`. `apps/school-server` with `GET /api/v1/exam/status` stub. `apps/cloud-web` with a placeholder page. `apps/exam-client` with a placeholder page built with target `chrome109`.
- Docker Compose for local: Postgres, Redis, MinIO, Mailpit (dev email catcher).
- `pnpm verify`, `pnpm dev`, `check:offline` (fails on a seeded test that adds a CDN URL).
- CI workflow from 2.5 with the first three jobs green. A `windows-installer` job that builds a placeholder installer.
- `docs/versions.md`, `docs/questions.md`, `docs/demo/`.

**Acceptance tests.**
- `pnpm install && pnpm verify` passes on a clean clone.
- `pnpm dev` brings every app up and `/health` returns `200`.
- Adding `<link href="https://fonts.googleapis.com/...">` to the exam client makes `pnpm check:offline` fail.

**Not in this milestone.** Any business logic.

---

### M1. `exam-core` and `shared-types`

**Goal.** The shared, pure, heavily tested code that both the cloud and the school server rely on.

**Read first.** API spec 14 and 15, section 4 of this file, Technical Design 8.

**Build in `packages/exam-core`** (no I/O, no Node-only APIs except `crypto`):
- `studentCode`: `generateBody`, `computeCheck`, `isValidCodeBody`, `normalise`, `formatCode`.
- `examKey`: `generate(randomInt)`, `hashKey(sittingId, key)`, `verify`.
- `shuffle`: `mulberry32`, `hash32`, `shuffle`, `orderForSession(questions, seed)`.
- `marking`: `mark(key, answer)`, `markSession(keys, answers)`, `percent`, normalisation for fill-blank, per API spec 14.5.
- `pack`: build and read a pack: manifest canonicalisation (RFC 8785), file hashing, `questions.json`, `keys.enc` encrypt and decrypt (AES-256-GCM), Ed25519 sign and verify, pack key wrapping and unwrapping with HKDF, and the verification order in API spec 14.4. A `verifyPack(file, publicKey, unwrapKey)` that returns a list of named failures.
- `sync`: `signRequest`, `verifySignature`, `buildStringToSign`, PIN reset code `pinResetCode(secret, time)` and `verifyPinResetCode`.
- `answers`: types and Zod schemas for the answer shapes in API spec 14.5 and 16.6.

**Build in `packages/shared-types`.** Zod schemas and inferred types for every request, response, event payload and error code in API spec sections 2 to 18. Export `ERROR_CODES`. Export the permission names used by CASL.

**Acceptance tests.**
- Every vector in sections 4.1 to 4.6 passes.
- Property tests (fast-check or equivalent): for 10,000 random bodies the computed check validates; every single-character substitution and every adjacent swap is rejected; `shuffle` is a permutation and is deterministic for a seed; `mark` never returns more than the question's marks.
- A pack built then verified passes. Flipping one byte in `questions.json`, `keys.enc`, the manifest, or the signature makes `verifyPack` fail with the specific named failure. A pack built for another `school_id` is refused.
- `keys.enc` cannot be decrypted with a key wrapped for a different device secret.
- Coverage of `exam-core` is at least 95% of lines.

**Not in this milestone.** Database, HTTP, UI.

---

### M2. Cloud foundation: database, tenancy, auth, roles, audit

**Goal.** A secure base every other module sits on.

**Read first.** Data Model 1, 2.2 and 4; API spec 1, 2, 3; Technical Design 4 and 13; this file 3.

**Build.**
- Drizzle schema and migration for the tables in Data Model 2.2 (`schools`, `users`, `teacher_profiles`, `sessions`, `invitations`, `otp_challenges`) plus `audit_logs`. The `citext` extension. Two database roles (app, platform) and RLS policies (`db/rls.sql`).
- Config, errors, validation, clock, ids, logging (section 3).
- Auth module: `POST /auth/login`, `/auth/logout`, `GET /auth/me`, sessions list and revoke, password change, TOTP setup, enable, disable (API spec 3). Lockout and rate limiting (Redis).
- Role and scope infrastructure: CASL ability factory, guards, repository scoping helpers, `404` for out-of-scope resources.
- Audit service with the transactional write and the privilege split.
- Bootstrap script `pnpm bootstrap:owner --email ...` that creates the Platform Owner in `invited` state and prints an invite link (no public sign-up, BR-01).
- Web: sign-in page, account page (change password, set up authenticator app), a signed-in shell with role-based navigation placeholders.

**Acceptance tests.**
- Login success and failure; the failure message is identical for unknown and wrong-password accounts; timing is similar (no user enumeration).
- Five failed logins lock the account for 15 minutes; a correct login after the lock still fails until it expires.
- Cookie flags: HttpOnly, Secure, SameSite=Lax. A `POST` without `X-CSRF-Token` is refused.
- TOTP: enable, then login requires a code; a recovery code works once.
- Changing a password revokes other sessions.
- RLS: a query in a transaction with `app.school_id` set to school A never returns school B's rows even if the repository code forgets a filter (write a deliberate bad-repository test).
- `UPDATE` and `DELETE` on `audit_logs` fail for the app role.
- The permission harness (7.1) exists and runs against the auth endpoints.

**Not in this milestone.** Invitations, teachers, parents.

---

### M3. Accounts, invitations, notifications, generic import, people

**Goal.** The school can create teachers and parents, who can claim their accounts. This is the answer to "how are logins created" (PRD 5, Technical Design 4.5).

**Read first.** PRD 5 and Epic 2, 4 (US-4.5, 4.6); Data Model 2.2, 2.3, 2.6; API spec 4, 5.1, 5.2, 7.3, 11.2; this file 3.10, 3.11, 3.15, 9, 10.

**Build.**
- Notification module with adapters, templates (section 10), delivery log (`notifications` table), monthly cap check.
- Invitations: create, send, resend, revoke, copy link, bulk resend, printable slips, expiry job (marks `expired`). Tokens are 32 random bytes, base64url, stored as SHA-256. OTP: 6 digits, 10 minutes, 5 attempts, 60 second resend, hashed.
- Public claim endpoints (API spec 4.1). On claim, in one transaction: set password, activate user, mark invitation used, link guardian to user. Copy the guardian's phone and email onto the new `users` row so sign-in by phone works.
- Teachers: CRUD, suspend, deactivate, reactivate, invite (API spec 5.1). Admin invite.
- Guardians: create with child links, matching by normalised phone then email, `GUARDIAN_MATCH_FOUND`, merge, restrict a link, contact change revoking pending invites (API spec 5.2).
- Password reset by OTP (API spec 3.2).
- Generic import engine: upload, queue, parse, preview rows, fix, skip, confirm, report (API spec 7.3), with parsers for `teachers` and `guardians` CSV/XLSX now and hooks for `students` (M4) and `questions` (M5). Parsing runs in the `import` queue.
- Web (Admin): Teachers list and invite, Guardians list and detail, Guardian import, Invitations screen. Public: Invite claim, Forgot password, Reset password.

**Acceptance tests** (each maps to a PRD story):
- US-2.1 to 2.7, 2.9, 2.11, 2.12, 4.5 and 4.6 as written.
- A teacher invited by email claims without an OTP; the same invite copied as a link demands an OTP to the registered email (BR-03).
- A guardian invite never sends an OTP to a contact the caller supplies.
- Five wrong OTPs lock the code; a new code after the cooldown works; the old code no longer works.
- Importing 3 rows with the same phone yields one guardian linked to 3 children. A guardian row matching an existing phone becomes a `warning` with the match shown.
- Reusing a claimed or expired token returns `INVITE_USED` or `INVITE_EXPIRED` and reveals no personal data.
- Suspending a user ends their active sessions immediately.
- SMS cap: at the cap, an SMS invite fails with `SMS_CAP_REACHED`, and email still works.
- Raw tokens, OTPs and passwords never appear in logs or in the database (check with a test that scans test logs and dumps).
- Permission tests for every new endpoint (API spec 19).

**Not in this milestone.** Students, codes, classes.

---

### M4. Academic structure, students, student codes

**Goal.** The school's structure and people exist, and every student has a code.

**Read first.** PRD Epic 3, Epic 4; Data Model 2.3, 2.4; API spec 5.3, 6; this file 4.1.

**Build.**
- Academic years, terms, levels, classes, subjects, class-subject assignments, class teacher, grade scale (API spec 6).
- Students: CRUD, status, move class, consents, promotions preview and apply, data export, anonymise.
- Student codes: generate on create, reissue, revoke, partial unique index, code sheet PDF (A4, 8 slips per page, name, class, code, school name, instructions), logged.
- `students` import (CSV and XLSX) on the generic engine.
- Web (Admin): Academic years and terms, Levels and classes, Subjects, Teacher assignments, Students list and detail, Student import, Code sheets, Consent.

**Acceptance tests.**
- US-3.1 to 3.7 and US-4.1 to 4.4, 4.8, 4.9.
- Exactly one current year and one current term at all times.
- A student gets exactly one active code; reissue revokes the old one and the old code fails `isValidCodeBody` is not the cause (it is still well-formed but `revoked`).
- The list and detail endpoints never include the code. The code sheet endpoint writes an audit entry.
- Importing a class list with a duplicate admission number flags it; nothing is created before confirm.
- Promotion preview matches apply exactly; graduates are marked; history is kept.
- Grade scale bands with a gap or overlap are rejected.
- Teachers can read only students in their assigned classes (permission test).

**Not in this milestone.** Questions, exams.

---

### M5. Question bank, assets, question import

**Goal.** Teachers can build a question bank by hand or from Word and Excel.

**Read first.** PRD Epic 5 and 6; Data Model 2.5, 2.6; API spec 7; this file 9.

**Build.**
- Question CRUD with the validation in API spec 7.1, versioning (approved questions are immutable, edits create a new version, BR-12), approve and retire, duplicate, search, preview in primary and secondary style.
- HTML sanitiser for stems and options (allow paragraphs, bold, italic, underline, lists, sub, sup, line breaks, images from the asset store only). KaTeX rendering for `$...$` in the web app.
- Assets: upload, resize to 1200 px wide, convert to a web format, hash, store, signed URLs.
- Excel and CSV question parser (ExcelJS), Word parser (`mammoth` to HTML, then the layout parser of section 9.2), image extraction from `.docx`, macro and type checks (API spec 7.4), duplicate detection (hash of normalised stem plus options within the school and subject).
- Row validation codes from API spec 7.3.
- Templates downloadable (section 9) with example rows.
- Web (Teacher): Question bank list and editor, Import wizard (upload, preview, confirm), Preview as student.

**Acceptance tests.**
- US-5.1 to 5.7, US-6.1 to 6.6.
- A fixtures folder with at least: a clean xlsx (40 questions), a clean docx (40 questions), an xlsx with every error type, a docx with images, a `.docm`, a renamed `.exe`, a 12 MB file, a password-protected xlsx. Each is rejected or flagged as specified.
- At least 90% of rows in the clean fixtures import with no fix (PRD 2.2).
- XSS: a stem containing `<script>`, `onerror=`, `javascript:` and an SVG payload is sanitised in every path (editor, import, preview).
- Editing an approved question returns a new question that supersedes the old one; the old version stays readable.
- Teachers see their own and approved questions in their subjects only; a teacher cannot see another subject's drafts.
- A 200-question file parses in under 30 seconds.

**Not in this milestone.** Exams.

---

### M6. Exams, sittings, pack builder, freeze

**Goal.** A teacher builds an exam, an admin schedules it, and the cloud produces a signed pack.

**Read first.** PRD Epic 7; Data Model 2.7; API spec 8, 14; Technical Design 8.1 and 9.5.

**Build.**
- Exam CRUD, class targets, question list with mark overrides, preview, duplicate, archive (API spec 8.2).
- Sittings: schedule, reschedule, cancel, make-up, overlap warnings, attendance (API spec 8.3, availability of attendance data comes fully in M7).
- Freeze logic as a derived state, and the scheduled job that builds a pack at T minus 24 hours when none exists for the current content.
- Pack builder job (`pack` queue): collect questions and assets, write `questions.json`, `keys.enc` (random pack key, AES-256-GCM), manifest, hashes, Ed25519 signature, store the file, store the encrypted pack key (`exam_packs.pack_key_enc`), mark `ready` or `failed` with a reason. Versions and `superseded` handling.
- `EXAM_NOT_PUBLISHABLE` checks. `EXAM_FROZEN` handling.
- Signing key management: private key from the environment or a secret manager, `key_id` in the manifest, support for two active public keys during rotation.
- Web (Teacher and Admin): Exam builder, Exam preview, Schedule sitting, Sittings calendar, Pack status.

**Acceptance tests.**
- US-7.1 to 7.9.
- A published pack passes `verifyPack` using only the public key and a key unwrapped from the cloud's wrapped-key endpoint (stubbed in this milestone).
- Editing a question set after the freeze without `acknowledge_new_pack_version` returns `EXAM_FROZEN`; with it, a new pack version is built and the old one is `superseded`.
- A pack contains no correct-answer information outside `keys.enc` (test: unzip, search every other file for correct option IDs and `fill_answers` content).
- Overlapping sittings create a warning, not an error.
- Idempotent publish: the same `Idempotency-Key` returns the same pack.
- Builds a 60-question exam with 20 images in under 20 seconds and a pack under 25 MB.

**Not in this milestone.** Sync, results.

---

### M7. Sync API (cloud), results ingest, review, release, key correction

**Goal.** The cloud can talk to school servers and turn uploaded sessions into results that teachers review and release.

**Read first.** PRD Epic 11, 12 (release), 15; Data Model 2.8, 2.9; API spec 9, 12, 13, 15, 18; Technical Design 9.

**Build.**
- Devices: activation codes, activation endpoint, device secret storage (encrypted with a key from the environment), revoke, health fields (API spec 12.2, 13.3). Platform Owner device list with flags.
- Sync auth middleware: signature check, clock skew, nonce store in Redis, `X-Server-Time` on every response (API spec 13.2).
- `change_log` writers: a database trigger or a service hook that writes a row for every relevant change to classes, subjects, students (including code and status), exams, sittings, packs, and the two settings. Make the writer part of the same transaction as the change.
- `GET /sync/v1/changes`, pack download with `Range`, pack key endpoint (wrapping with HKDF per API spec 13.6), heartbeat with update offers and health flags, backups upload and download.
- `POST /sync/v1/results`: batch intake, per-event idempotency through `sync_events`, handlers for each event type (API spec 15.1), per-event outcomes. Buffering of events for sessions not yet seen.
- Results pipeline: create `submissions` and `submission_answers`; re-mark with `exam-core` (`cloud_marks`); compare with `school_score` and audit mismatches; create `results` as draft; apply grade scale.
- Review, release, withdraw, stats, exports (API spec 9.2). Release notification fan-out to guardians with `can_view_results` (the notification contains no scores).
- Key correction flow: preview, apply, re-mark, revision bump, notification on a released change (API spec 9.3).
- USB: `.cbtsync` import endpoint and the USB pack bundle download (API spec 18).
- Web (Teacher and Admin): Results by exam, Result detail, Question statistics, Re-mark, Release results, Make-up sittings, Sync and server status, Notifications log, Audit log. (Platform Owner): Server health list and detail.

**Acceptance tests.**
- US-1.4 to 1.6, US-8.4 (cloud side), US-11.2 to 11.7, US-12.1, US-12.7, US-13.1 to 13.3, US-15.1 (cloud side), US-15.3, US-15.4, US-16.1.
- A signed request with the vector in 4.4 is accepted. A body change, a replayed nonce, a timestamp 6 minutes old, a revoked device and a wrong key id are each rejected with the specific code.
- `changes` never returns guardian, user, or contact data (test by scanning the JSON of a populated school against a deny-list of field names).
- Replaying the same results batch five times produces exactly one submission per session and `duplicate` outcomes after the first.
- Events arriving out of order (`scored` before `submitted`) end in the same final state.
- If `school_score` differs from the cloud's own total, an audit entry `score_mismatch` is written and the result uses the cloud score.
- Only `reviewed` results release; a Class Teacher can release only when `release_policy = class_teacher`; release creates one notification per eligible guardian and none for restricted links.
- Key correction: preview changes nothing; apply creates revision 2 only for affected results; a released result becomes "updated" and guardians are notified once.
- Pack download resumes correctly after a truncated transfer (`Range`).
- A `.cbtsync` file processed twice changes nothing the second time.

**Not in this milestone.** The Parent Portal screens, the school server.

---

### M8. Parent Portal

**Goal.** Parents sign in once and see their children's released results.

**Read first.** PRD Epic 12; API spec 10; Data Model 2.8.

**Build.** The parent endpoints (API spec 10) and the Parent Portal web app: Sign in, Children and switcher, Result list, Result detail, Trends, Account and notification preferences, Add email with OTP. Mobile-first layout (parents use phones). Result pages must work on a slow connection: no large images, server-rendered first paint.

**Acceptance tests.**
- US-12.2 to 12.6.
- A parent with two children, one restricted, sees both children and results only for the unrestricted one.
- Requesting another family's child, result or trend returns `404`, for every parent endpoint, using real IDs from another family (this is the most important test of the milestone).
- Draft, reviewed and withdrawn results never appear. A withdrawn result shows "under review" and no scores.
- A re-marked released result shows the "updated" label.
- Lighthouse performance on a throttled mobile profile is at least 85 on the result list.
- Two guardians of the same child each have their own login and neither sees the other's account data.

---

### M9. School server core: database, sync agent, pack loader

**Goal.** A school server that activates, pulls its roster and packs, and uploads events, running on any machine (Windows service comes in M12).

**Read first.** Data Model 3; API spec 13, 14.4, 15; Technical Design 6.2, 8, 9.

**Build.**
- SQLite database with the pragmas in Data Model 3 (WAL, `synchronous = FULL`, foreign keys, busy timeout), Drizzle schema and numbered migrations that run at start after taking a backup copy.
- First-run setup flow: activation page (enter code), call `/sync/v1/activate`, store the device secret protected at rest (Windows DPAPI at machine scope when on Windows; an OS-keyed file on other systems for development), set the console PIN, store the cloud public key.
- Sync agent: signed client (`exam-core/sync`), clock offset tracking, `changes` pull with cursor stored in the same transaction as the applied changes, pack download with resume and verification (API spec 14.4), pack key fetch and unwrap, heartbeat every 5 minutes, results upload from the outbox with backoff, rejected-event handling, backup upload.
- Outbox: written in the same transaction as the data it describes. Never deleted before `acked_at`.
- Offline behaviour: the agent must never block or slow the Exam API. Run it in a separate worker thread or at least as a non-blocking loop with its own timeouts.
- Backups: SQLite backup API or `VACUUM INTO` after each sitting closes and nightly, to the data folder and to a configurable second location, checksummed, last 30 kept.
- Local audit log.

**Acceptance tests.**
- US-8.2 to 8.4, US-15.1 (school side), US-15.4.
- Activate against a staging cloud: school name shown; a wrong, used, or expired code gives the specified error.
- Pull a roster of 600 students and 5 packs; kill the process during a pack download; restart; the download resumes and the hash verifies.
- A pack with one flipped byte, a wrong `school_id`, or a bad signature is refused and the console-facing status says which check failed, in plain words.
- Pull the network during an upload batch: no outbox row is lost; after reconnect the cloud has each event exactly once.
- Kill the process (`kill -9`) at random points of a write loop 200 times: the database is never corrupt, and every acknowledged write is present.
- With the cloud unreachable for a simulated week, the server keeps serving the Exam API and the outbox grows without limit problems up to 100,000 rows.
- Cursor safety: if a change page fails halfway, the stored cursor is unchanged and the next pull re-applies the page safely.

---

### M10. School Exam API and exam client

**Goal.** Students can take an exam, with everything in API spec 16 working.

**Read first.** PRD Epic 10; API spec 16, 14.5, 14.6; Technical Design 8; this file 2.2 (build target), 4.

**Build.**
- Exam API (API spec 16): `status`, `login`, `start`, `session`, `answers`, `ping`, `submit`, `events`, `assets`. Tickets and session tokens. Seat lockout. Server-side expiry job. Marking on submit with `exam-core`, outbox writes in the same transaction. Extra time reflected in `ends_at`.
- Exam client (React, Vite, target `chrome109`):
  - Login screen with the code field, exam key field, auto-uppercase, clear specific errors (API spec 2), and a QR/link display option for phones.
  - Instructions and start screen.
  - Secondary question screen: navigator, flag, previous/next, keyboard shortcuts, countdown with warnings at 10, 5 and 1 minutes.
  - Primary question screen: one large question, large buttons, images, optional read-aloud using the browser speech API only if a voice is available offline.
  - Review and submit screen showing unanswered count, submitted screen, optional score screen.
  - Autosave engine: in-memory state, IndexedDB buffer with a `localStorage` fallback, batch sender with `seq`, exponential backoff, "Saved" and "kept on this PC" status, replay of the buffer after a reconnect or reload, resume from `GET /session`.
  - Adjustable text size, high contrast, no reliance on colour alone.
  - Bundled assets only: fonts, KaTeX, icons (checked by `check:offline`).

**Acceptance tests.**
- US-10.1 to 10.11, US-9.5 (extra time reaches the screen within one save cycle), US-9.8.
- Every error code in API spec 2 (student table) is reachable by a test and shows the specified message.
- Playwright journey: log in, start, answer all questions, reload the page mid-exam, the same question order and answers return, submit. Repeat on a viewport of 1024×768 and 1366×768.
- Switch the server off for 60 seconds mid-exam: the client keeps working, shows the offline status, and after the server returns every answer is on the server and `ack_seq` catches up.
- `kill -9` the server mid-exam, restart: students resume with saved answers; at most the last unacknowledged batch is replayed from the browser buffer; none is lost.
- Two PCs: sign in on PC-1, start; sign in as the same student on PC-2 after PC-1 is offline for 30 seconds: PC-2 resumes, PC-1's token stops working.
- The same student cannot create a second submitted session for the same exam (BR-10). After an invigilator reset a new session can start.
- Timer: the server ends a session at `ends_at` with `time_up` even if the client is gone.
- A student of class A cannot enter a sitting for class B. A revoked code fails.
- Accessibility: keyboard-only completion of an exam; axe-core reports no serious or critical issues on the main screens.
- Answer keys: a scan of every response of a full exam run (HAR) finds no `is_correct`, `correct_option_ids` or fill answers.
- Bundle: the exam client's initial JavaScript is under 400 KB gzipped and it loads and works on a machine with 2 GB RAM and Chrome 109 (document the test machine).

---

### M11. Invigilator console and live updates

**Goal.** One person can run a whole sitting from the console.

**Read first.** PRD Epic 9, US-8.5, US-15.2; API spec 17.

**Build.** The Console API and the console web page (served at `/console`): PIN sign-in with lockout; overview with readiness checks in plain English; sitting detail with the exam key in a large readable form; open and close; live seat list over WebSocket (progress, last saved, online or offline after 30 seconds); seat assignment; extra time for a student or the whole room; reset a session; release a seat; regenerate key; sync status and Sync now; backups and Backup now; health; pack import from a file; results export to `.cbtsync`; PIN change and PIN reset with the cloud code (verified offline, vector in 4.4); local audit view.

**Acceptance tests.**
- US-9.1 to 9.9, US-8.3, US-8.5, US-8.6, US-15.2, US-15.3.
- A seat's progress changes on the console within 3 seconds of an answer being saved (measure in the Playwright run).
- Readiness shows a failing check, with plain-English text and an action, for each of: pack missing, pack unverified, roster incomplete, low disk (simulated), clock off (simulated), backup old, window passed.
- Opening a sitting when not ready requires an override reason and writes it to the audit log.
- Closing a sitting submits and marks every open session and writes `sitting.closed`.
- Five wrong PINs lock the console for five minutes. The reset code from the cloud unlocks it, and a code from two hours ago does not.
- Every console action appears in the local audit log with the label and reason, and reaches the cloud audit log after sync.
- Updates cannot be applied while a sitting is open (checked in M12 too).

---

### M12. Windows service, installer, backup, update, restore

**Goal.** A non-technical person can install the exam server on a lab PC and replace it if it dies.

**Read first.** PRD US-8.1, US-15.4 to 15.6; Technical Design 14; this file 6.

**Build.** Everything in section 6: bundled `node.exe`, app bundle, WinSW service, Inno Setup installer, firewall rule, power settings, first-run page, data folders, code signing step, silent install flags, uninstall, in-app update with rollback, restore from backup or from the cloud, and a recovery guide.

**Acceptance tests** (run on a clean Windows 10 and Windows 11 VM, and on Windows 10 with Defender and one third-party antivirus if available):
- US-8.1, US-15.5, US-15.6.
- Install, reboot: the service is running with no login. Stop it from Task Manager: it restarts within 10 seconds.
- Another PC on the LAN opens `http://<ip>:8080` and the console from the server PC works. A PC on a different subnet cannot (the firewall rule is scoped to the local subnet).
- Sleep and hibernate are disabled. The PC stays reachable after 30 minutes idle.
- Upgrade over an existing install keeps the data and activation. A deliberately broken update rolls back automatically and the service is healthy again within 60 seconds.
- Restore drill: delete the database, restore from the latest backup, the server starts with the right roster and every unsent outbox row. Then the full disaster drill: install on a second PC, activate with a replacement code, pull the roster and packs from the cloud and restore the backup from the cloud. The whole drill takes under 60 minutes, timed, using only the written runbook.
- Uninstall leaves the data folder unless the user chooses to remove it.
- The installer is signed. SmartScreen behaviour is documented in the runbook.

---

### M13. Hardening, load and fault tests, pilot readiness

**Goal.** Evidence that the system survives exam day.

**Read first.** Section 7; Technical Design 15, 16, 18.

**Build.** Complete the permission matrix test, the load and fault tests (7.4, 7.5), a security pass (7.6), monitoring (Sentry, uptime checks, backup success alerts), operations runbooks (`docs/runbooks/`: exam-day checklist, replace a dead server, restore, update, rotate keys, offboard a school), seed and demo data for training, performance fixes found by the tests.

**Acceptance tests.**
- Every item in the PRD section 11 MVP acceptance checklist passes on a real lab PC with a real class (30 or more students), observed and signed off.
- Load test passes at 60 and at 150 simulated clients (7.4).
- Every fault in 7.5 recovers as stated.
- No high or critical finding open from the security pass in 7.6.
- Backups restore. The runbooks have been followed once by someone who did not write them.

---

### M14. Phase 2: school fees (outline only)

Do not start until M13 is signed off and the school has confirmed fees are in scope. Outline: fee items per class and term, invoices, payment links through a payment provider's hosted checkout, webhook handling in the cloud only (webhooks cannot reach the school), partial payments, receipts to the parent and the school, outstanding balances per class, reminders through the notification adapters, a read-only fees view on the school server if the bursar needs it offline. Tables: `fee_items`, `invoices`, `invoice_lines`, `payments`, `receipts` (Data Model 2.9, outline). Money in kobo.

---

## 6. Windows service and installer

### 6.1 What is installed

```
C:\Program Files\SchoolCBT\
   node.exe                    Node.js runtime (same version as .nvmrc)
   app\server.cjs              bundled school server (esbuild or tsup)
   app\node_modules\better-sqlite3\...\better_sqlite3.node   prebuilt for win32-x64 and this Node ABI
   app\exam-client\            static exam client
   app\console\                static console page
   SchoolCBT.exe               WinSW service wrapper (renamed)
   SchoolCBT.xml               WinSW configuration
   tools\                      small helper scripts (firewall, power, uninstall)
C:\ProgramData\SchoolCBT\
   data\school.db              SQLite database (WAL files alongside)
   packs\                      verified packs
   backups\                    local backups
   logs\                       rotating logs
   config.json                 port, cloud URL, second backup path (no secrets)
   secrets\device.bin          device secret, protected with DPAPI (machine scope)
```

Build the native module on a Windows runner against the bundled Node version. Do not rely on the target PC having Visual Studio, Python or internet.

### 6.2 Service configuration

`SchoolCBT.xml` (WinSW), essentials:

```xml
<service>
  <id>SchoolCBT</id>
  <name>School CBT Exam Server</name>
  <description>Runs the school's offline exams.</description>
  <executable>%BASE%\node.exe</executable>
  <arguments>"%BASE%\app\server.cjs"</arguments>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="5 sec"/>
  <onfailure action="restart" delay="5 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <resetfailure>1 day</resetfailure>
  <env name="NODE_ENV" value="production"/>
  <env name="CBT_DATA_DIR" value="C:\ProgramData\SchoolCBT"/>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>10</keepFiles></log>
  <stoptimeout>20 sec</stoptimeout>
</service>
```

On a stop request the server stops accepting new logins, finishes in-flight writes, checkpoints the WAL, and exits within the timeout. The service runs as `LocalService` or a dedicated low-privilege account with write access only to `C:\ProgramData\SchoolCBT`.

### 6.3 Installer steps (Inno Setup)

1. Check Windows 10 or 11, 64-bit. Refuse anything else with a clear message.
2. Check free disk space (at least 10 GB) and that port 8080 is free. If not, offer another port and write it to `config.json`.
3. Copy files. If upgrading: stop the service, take a backup of the database, replace files, keep the data folder.
4. Install and start the service.
5. Add the firewall rule, scoped to the local subnet:

```
netsh advfirewall firewall add rule name="SchoolCBT" dir=in action=allow protocol=TCP localport=8080 remoteip=LocalSubnet profile=any
```

6. Power settings: `powercfg /change standby-timeout-ac 0`, `powercfg /change hibernate-timeout-ac 0`, `powercfg /hibernate off`, and set the disk sleep timeout to never. Leave the monitor setting alone.
7. Create the data folders with permissions for the service account only.
8. Open `http://localhost:8080/setup` in the default browser: enter the activation code, set the console PIN, choose the second backup location. Show the server's address and a QR code for the lab shortcut.
9. Offer to write the lab shortcut file (`SchoolCBT-Exam.url` and a `.bat` that opens Chrome or Edge in kiosk mode at the server address) to a folder, so it can be copied to each lab PC across the network.

The backup schedule is created at first run inside the service (nightly at 22:00 and after each sitting). The installer does not need a Windows Scheduled Task, which satisfies US-8.1 without an extra moving part.

### 6.4 Updates and rollback

The heartbeat offers a new version (API spec 13.8). The server downloads it to `updates\`, verifies SHA-256, and waits. When the invigilator presses Apply (or when no sitting is open or due within 2 hours and auto-update is on), a small updater executable: stops the service, backs up the database and the old app folder, installs the new files, starts the service, and polls `/api/v1/exam/status` for up to 60 seconds. If it does not become healthy it restores the old folder and database, restarts, and reports `update_failed` in the next heartbeat. Migrations are forward-only, so rollback restores the pre-update database backup.

### 6.5 Code signing

Sign `SchoolCBT.exe`, the updater and the installer with a code-signing certificate, with a timestamp. Unsigned builds work but show SmartScreen and antivirus warnings. Document how to proceed (More info, then Run anyway) in the runbook for the interim.

### 6.6 Lab PC shortcut

```
chrome.exe --kiosk --disable-pinch --overscroll-history-navigation=0 --user-data-dir="%LOCALAPPDATA%\SchoolCBT\browser" "http://192.168.1.10:8080/?seat=PC-12"
```

For Edge replace `chrome.exe` with `msedge.exe`. The `seat` value is the PC's label. The shortcut batch file takes the label from `%COMPUTERNAME%` so one file works on every PC. Kiosk mode and `--user-data-dir` keep exam storage separate from normal browsing.

---

## 7. Testing requirements

### 7.1 Permission matrix test

Build the test from API spec section 19. For each role (Platform Owner, School Admin, Teacher, Class Teacher, Parent, unauthenticated) and each protected endpoint, send a real request and assert allowed or denied exactly as the table says, including scope (a teacher on another teacher's class, a parent on another family's child). Fail the build if an endpoint exists that is not in the matrix. The matrix is data (`packages/shared-types/permissions.ts`) used by both the guards and this test.

### 7.2 Unit and integration tests

| Area | Required |
|---|---|
| `exam-core` | 95% line coverage, vectors in section 4, property tests |
| Repositories | Real Postgres (Testcontainers or the compose service), not mocks |
| Auth and invitations | Every state transition and every error code |
| Sync cloud side | Signature, replay, idempotency, ordering, partial batches |
| School server | Real SQLite files, crash-and-restart tests |

### 7.3 End-to-end journeys (Playwright)

| # | Journey |
|---|---|
| J1 | Admin creates school data, imports students and guardians, invites go out (Mailpit catches emails) |
| J2 | Teacher claims invite, imports a Word file, builds and publishes an exam |
| J3 | School server activates, pulls roster and pack, readiness passes |
| J4 | 30 students sit the exam (mixed primary and secondary), including a resume after reload |
| J5 | Results sync, teacher reviews, admin releases, parent claims invite and sees the result |
| J6 | Key correction and re-mark, parent sees "updated" |
| J7 | Replacement of a dead server in a test environment |

### 7.4 Load test

Simulated clients (Node or k6) against a real school server on a real network. Each client logs in, starts, and answers a question every 5 to 15 seconds with realistic batching, pings every 15 seconds, and submits at the end of a 20 minute exam.

| Run | Pass criteria |
|---|---|
| 60 clients | p95 answer-save latency under 200 ms, p99 under 500 ms, zero failed saves, CPU under 60%, final stored answers equal expected for every client |
| 150 clients | p95 under 400 ms, zero lost answers |
| Submit burst | All 150 submit within 10 seconds of each other: every session marked within 5 seconds of its submit |
| Soak | 3 hours with 20 clients, memory growth under 10% |

### 7.5 Fault tests

| Fault | Expected |
|---|---|
| `kill -9` the server mid-exam, restart | Clients reconnect, resume, no acknowledged answer lost |
| Unplug the network cable for 2 minutes on 10 PCs | Clients keep working locally, then catch up |
| Server PC clock set 10 minutes wrong | Console warns, sync refuses signed requests with `CLOCK_SKEW`, exams still run |
| Disk nearly full (simulated) | Console warning, backups skip with a message, exams still run |
| Internet off for a full simulated term | Exams run, outbox grows, then drains in order on reconnect with no duplicates |
| Cloud down while the school is online | Sync retries, exams unaffected |
| Power cut (hard reset of a VM) mid-write loop, 50 times | Database integrity check passes every time |
| Two PCs log in as the same student at once | One wins, the other is told clearly |
| Student closes the browser and reopens | Resumes with the same order and answers |
| Pack with a bad signature offered | Refused with the named reason |
| Update that fails to start | Rolled back automatically |

### 7.6 Security pass

OWASP ASVS level 2 checklist for the cloud. Run dependency audit and a secret scan in CI. Specific checks: no user enumeration in login, reset or invite; session fixation; CSRF; IDOR on every parent and teacher endpoint with IDs from another tenant; file upload abuse (zip bombs, polyglot files, SVG, macros); injection in imports; rate limits actually enforced; logs free of secrets; backups and signing keys not readable by the application database role; the school server listens only on the lab interface and the console is not reachable without the PIN.

---

## 8. Definition of done and review checklist

A milestone is done when all of these are true:

- [ ] Every story named in the milestone passes its acceptance criteria, shown by tests.
- [ ] `pnpm verify`, `pnpm test:perm` and the milestone's E2E journeys pass in CI.
- [ ] Migrations run forward on an empty database and on the previous milestone's data.
- [ ] New endpoints are in the permission matrix and in `shared-types`.
- [ ] Every state-changing action writes an audit entry.
- [ ] No secret, token, OTP, student code, exam key, or answer appears in logs (test or review).
- [ ] The exam client and console pass `check:offline`.
- [ ] Docs updated: the affected sections of documents 01 to 03, `docs/demo/Mx.md`, and any new questions in `docs/questions.md`.
- [ ] A reviewer who did not write the code has read the diff using this checklist: tenancy scoping on every query, input validation, error codes from the catalogue, idempotency where required, and tests that fail without the change.

---

## 9. Import templates

Templates are generated by the app (`GET /imports/templates/...`) and each has an Examples sheet or section and a short Instructions sheet. Column names are lowercase with underscores. Headers are matched case-insensitively and ignoring spaces. Unknown columns are ignored with a warning.

### 9.1 Questions: Excel or CSV

| Column | Required | Values and notes |
|---|---|---|
| `subject` | no | If empty, the subject chosen on the upload screen is used. If present it must match a subject name |
| `level` | no | Same idea. Must match a level name |
| `topic` | no | Free text |
| `type` | yes | `single_choice`, `multi_choice`, `true_false`, `fill_blank`. Also accepted: `mcq`, `single`, `multiple`, `multi`, `tf`, `true/false`, `fill`, `blank` |
| `question` | yes | The stem. May contain `$...$` for maths |
| `option_a` to `option_f` | for choice types | Option text. At least two |
| `correct` | yes | Choice types: letters like `B` or `A,C`. True/false: `True` or `False`. Fill blank: accepted answers separated by `\|`, for example `Abuja\|FCT` |
| `marks` | no | 0.5 to 20. Default 1 |
| `difficulty` | no | `easy`, `medium`, `hard` |
| `explanation` | no | Shown to teachers |
| `image` | no | A file name from the images zip uploaded with the sheet (`images.zip`) |
| `case_sensitive` | no | Fill blank only: `yes` or `no`. Default `no` |

Example rows:

```
type,question,option_a,option_b,option_c,option_d,correct,marks,difficulty
single_choice,What is 2 + 2?,3,4,5,6,B,1,easy
multi_choice,Which are prime numbers?,2,4,5,9,"A,C",2,medium
true_false,The sun rises in the west.,,,,,False,1,easy
fill_blank,The capital of Nigeria is ____.,,,,,Abuja|FCT,1,easy
```

### 9.2 Questions: Word (`.docx`)

The parser takes the document as HTML (from `mammoth`) and walks paragraphs. A question is a block of consecutive paragraphs; blocks are separated by a blank paragraph or by the next `Q`-number.

```
Q1. What is 2 + 2?
A. 3
B. 4
C. 5
D. 6
Answer: B
Marks: 1
Topic: Addition
Difficulty: easy
Explanation: Two plus two is four.

Q2. Which of these are prime numbers?
A) 2
B) 4
C) 5
D) 9
Answer: A, C
Marks: 2

Q3. The sun rises in the west.
Type: TF
Answer: False

Q4. The capital of Nigeria is ____.
Type: Fill
Answer: Abuja | FCT
Case: no
```

Parsing rules:

- A question starts with `Q<number>.` or `<number>.` or `<number>)` at the start of a paragraph.
- Options start with `A.`, `A)` or `(A)` and run to `F`.
- Keyword lines (`Answer`, `Marks`, `Topic`, `Difficulty`, `Explanation`, `Type`, `Case`) are case-insensitive and may use `:` or `-`.
- Type is inferred if `Type:` is missing: options present means single choice, or multiple choice when `Answer` lists several letters. `Type: TF` and `Type: Fill` are explicit.
- A picture in the stem paragraph or an option paragraph is extracted, stored as an asset and attached.
- Bold, italic, superscript and subscript are kept. Tables inside questions are not supported and produce a warning.
- Anything that does not fit produces an `error` row naming the paragraph number.

### 9.3 Students (CSV or XLSX)

| Column | Required | Notes |
|---|---|---|
| `admission_no` | yes | Unique in the school |
| `first_name` | yes | |
| `last_name` | yes | |
| `other_names` | no | |
| `gender` | no | `M` or `F` |
| `date_of_birth` | no | `YYYY-MM-DD` or `DD/MM/YYYY` |
| `class` | yes | Must match an existing class name, for example `JSS 2 Gold` |

### 9.4 Guardians (CSV or XLSX)

| Column | Required | Notes |
|---|---|---|
| `guardian_name` | yes | |
| `phone` | one of phone or email | Normalised to E.164. Rows with the same phone become one guardian |
| `email` | one of phone or email | |
| `relationship` | no | `mother`, `father`, `guardian`, other text |
| `child_admission_no` | yes | One admission number per row, or several separated by `;` |
| `can_view_results` | no | `yes` or `no`. Default `yes` |

### 9.5 Teachers (CSV or XLSX)

| Column | Required | Notes |
|---|---|---|
| `full_name` | yes | |
| `email` | yes | Unique in the school |
| `phone` | no | |
| `staff_no` | no | |

---

## 10. Notification templates

All messages are short, plain and never contain a score, student code or exam key. `{{ }}` are variables. Links are single-use tokens (invites) or portal pages that require sign-in (results).

### 10.1 Email

| Template | Subject | Body (summary) |
|---|---|---|
| `invite_staff` | You're invited to {{school_name}} | "Hello {{name}}, {{school_name}} has set up an account for you on the exam platform. Set your password here: {{link}}. This link works once and expires on {{expires_on}}." |
| `invite_guardian` | See {{school_name}} results online | "Hello {{name}}, {{school_name}} has set up access for you to see your child's exam results. Open {{link}} to get started. You will be asked for a code sent to this email. The link works once and expires on {{expires_on}}." |
| `otp` | Your verification code | "Your code is {{code}}. It expires in 10 minutes. If you did not ask for it, ignore this message." |
| `password_reset` | Reset your password | "Use code {{code}} or open {{link}} to reset your password. It expires in 10 minutes." |
| `results_released` | New results for {{child_first_name}} | "{{school_name}} has released new results for {{child_first_name}}. Sign in to see them: {{portal_link}}." |
| `result_updated` | Updated result for {{child_first_name}} | "A result for {{child_first_name}} has been corrected. Sign in to see the update: {{portal_link}}." |
| `invite_reminder` | Reminder: your {{school_name}} invitation | "Your invitation expires on {{expires_on}}. Open {{link}}." |

### 10.2 SMS and WhatsApp (160 characters or fewer per SMS)

| Template | Text |
|---|---|
| `invite_guardian_sms` | `{{school_name}}: see your child's results online. Open {{short_link}}. Expires {{expires_on}}.` |
| `otp_sms` | `Your {{school_name}} code is {{code}}. Valid 10 minutes.` |
| `results_released_sms` | `{{school_name}}: new results for {{child_first_name}} are ready. Sign in: {{portal_short_link}}` |
| `result_updated_sms` | `{{school_name}}: a result for {{child_first_name}} was updated. Sign in: {{portal_short_link}}` |

WhatsApp business messages sent outside a customer-initiated conversation normally need pre-approved templates with the provider. Register the same four texts as templates and keep the provider mapping in configuration. Check the provider's current rules and costs before enabling.

### 10.3 In-app (Parent Portal)

`results_released`, `result_updated`: "New results for {{child_first_name}}" with a link to the result list.

### 10.4 Rules

- Short links point to the school's portal domain.
- Parents can turn off SMS and WhatsApp in their preferences but cannot turn off invitation, OTP and password reset messages.
- Paid channels check the monthly cap before sending (US-13.3). A failed or capped message is logged with a reason and shown in the notification log.

---

## 11. Configuration and environment variables

### 11.1 Cloud API and worker

| Variable | Purpose |
|---|---|
| `NODE_ENV`, `PORT`, `PUBLIC_URL` | Basics. `PUBLIC_URL` builds invite and portal links |
| `DATABASE_URL`, `DATABASE_URL_PLATFORM` | App role and platform role connections |
| `REDIS_URL` | Rate limits, nonces, queues |
| `SESSION_SECRET` | Signs CSRF and cookies |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` | Object storage |
| `EMAIL_PROVIDER` and its keys, `EMAIL_FROM` | `console`, `smtp` or a provider key |
| `SMS_PROVIDER`, `WHATSAPP_PROVIDER` and keys | Optional. `console` in dev |
| `PACK_SIGNING_PRIVATE_KEY`, `PACK_SIGNING_KEY_ID`, `PACK_SIGNING_PREVIOUS_PUBLIC_KEYS` | Ed25519 pack signing and rotation |
| `PACK_KEY_ENCRYPTION_KEY` | Encrypts pack keys at rest (32 bytes) |
| `DEVICE_SECRET_ENCRYPTION_KEY` | Encrypts school server secrets at rest (32 bytes) |
| `SENTRY_DSN` | Optional |
| `LOG_LEVEL` | `info` default |

### 11.2 School server (`config.json` plus environment)

| Setting | Purpose |
|---|---|
| `CBT_DATA_DIR` | Data folder, default `C:\ProgramData\SchoolCBT` |
| `port` | Default 8080 |
| `cloud_url` | Set at activation |
| `second_backup_path` | Second backup location (external drive or network share) |
| `sync_interval_seconds` | Default 300 |
| `log_level` | Default `info` |

Secrets (device secret, PIN hash, cloud public key) are not in `config.json`.

### 11.3 Cloud web and exam client

Public build-time values only (`NEXT_PUBLIC_API_URL`). The exam client takes everything from its own origin and has no environment values.

---

## 12. Seed data and demo fixtures

`pnpm seed:demo` creates, in a school called "Demo College" (code `DEM`):

- 1 Platform Owner and 1 School Admin (printed invite links, emails in Mailpit).
- Academic year, three terms, levels Primary 4, Primary 5, JSS 1, JSS 2, and classes `Primary 4 Blue`, `JSS 2 Gold`.
- 10 teachers with assignments across 6 subjects.
- 60 students in the two classes, 40 guardians (some with two children, one restricted link), consent records.
- 300 approved questions across subjects and levels, including images and maths.
- Two exams (one primary, one secondary) with sittings scheduled, one already past with submitted sessions and draft results.
- Sample files for imports under `packages/test-fixtures/imports/` as listed in M5 and M3.
- A load-test client in `packages/test-fixtures/load/`.

All names, phone numbers (use the reserved range `+234 800 000 xxxx`) and emails (`@example.com`) are fictional.

---

## 13. Prompts for the coding agent

Give the agent the master prompt once, then one milestone prompt at a time. Replace `Mx` as needed.

### 13.1 Master prompt

```
You are building the School CBT Platform from six specification documents in /docs:
CBT-Technical-Design.md, CBT-01-Product-Requirements.md, CBT-02-Data-Model.md,
CBT-03-API-and-Sync-Specification.md, CBT-04-Build-Specification.md, CBT-05-Site-Survey-Checklist.md.

Rules:
- Read all six before writing code. CBT-04 section 1.2 says which document wins on each kind of question.
- Work one milestone at a time, in the order in CBT-04 section 5. Do not start the next milestone until the
  acceptance tests of the current one pass.
- Follow CBT-04 sections 2 and 3 for structure and building blocks. TypeScript strict. Zod at every boundary.
- Write tests with the code. Anything in packages/exam-core, auth, permissions, sync and marking must have tests
  that fail without it. Use the vectors in CBT-04 section 4 exactly.
- Never invent endpoints, tables or fields that the documents define under another name. If something is missing
  or the documents disagree, record it in docs/questions.md, choose the safest option, continue, and mention it
  in your summary.
- The school server and exam client must never call the internet except the cloud sync endpoints, and must pass
  `pnpm check:offline`.
- Never log passwords, tokens, OTP codes, student codes, exam keys or answers.
- Finish every milestone with: code, migrations, tests, updated docs, docs/demo/Mx.md, and a summary that lists
  the user stories covered, tests added, decisions made, open questions, and anything not done.
- Before saying a milestone is done, run `pnpm verify` and `pnpm test:perm` and show the results.
Ask me only when CBT-04 section 14 says to.
```

### 13.2 Milestone prompts

**M0**
```
Do milestone M0 from CBT-04 section 5. Create the monorepo exactly as in section 2.1 with the tooling in 2.2 to 2.5.
Docker Compose for Postgres, Redis, MinIO and Mailpit. Health endpoints. pnpm verify, pnpm dev and check:offline
working. CI with the first three jobs green. Record exact versions in docs/versions.md.
```

**M1**
```
Do milestone M1. Build packages/exam-core and packages/shared-types as specified. Implement every function listed.
Use the test vectors in CBT-04 sections 4.1 to 4.6 exactly, add property tests, and reach 95% line coverage in exam-core.
Pack building and verification must follow CBT-03 sections 14.1 to 14.4. No I/O, no database, no HTTP.
```

**M2**
```
Do milestone M2. Cloud foundation: Drizzle schema and migrations for CBT-02 section 2.2 plus audit_logs, the two
database roles and RLS, config, errors, validation, auth endpoints from CBT-03 section 3, CASL roles and scoping,
the transactional audit service, the bootstrap:owner script, and the sign-in and account web pages. Build the
permission test harness (CBT-04 section 7.1) and run it against the auth endpoints. Prove tenant isolation with a
deliberately faulty repository test.
```

**M3**
```
Do milestone M3. Notifications (adapters, templates from CBT-04 section 10, delivery log, SMS cap), invitations and
OTP, the public claim endpoints, teachers, guardians with phone matching, password reset, and the generic import
engine with teacher and guardian parsers. Follow CBT-01 section 5 for every account rule and CBT-03 sections 4, 5.1,
5.2 and 7.3. Add the Admin screens and the public claim and reset pages.
```

**M4**
```
Do milestone M4. Academic structure, students, student codes (CBT-04 section 4.1), code sheet PDF, consents,
promotions, student import. Follow CBT-03 sections 5.3 and 6 and CBT-02 sections 2.3 and 2.4. The code must never
appear in list or detail responses. Add the Admin screens.
```

**M5**
```
Do milestone M5. Question bank with versioning and sanitising, assets, question import from Excel, CSV and Word using
the templates in CBT-04 section 9, row validation, preview and confirm. Follow CBT-03 sections 7.1 to 7.4. Create the
fixture files listed in the milestone and prove each is accepted, flagged or rejected correctly. Add the Teacher screens.
```

**M6**
```
Do milestone M6. Exams, sittings, freeze logic, the pack builder job and pack signing, following CBT-03 sections 8
and 14. A pack must pass verifyPack from exam-core. Prove that no correct-answer data exists outside keys.enc.
Add the exam builder, schedule and pack status screens.
```

**M7**
```
Do milestone M7. The Sync API on the cloud (CBT-03 section 13), device activation, signed-request middleware,
change_log, results ingest with idempotency and re-marking, review, release, withdraw, key correction with preview and
apply, USB import. Follow CBT-03 sections 9, 12, 13, 15 and 18. Prove replay safety, out-of-order events, and that
the changes feed never contains guardian or user data.
```

**M8**
```
Do milestone M8. The Parent Portal API (CBT-03 section 10) and the mobile-first web app. The most important test is
that every parent endpoint returns 404 for another family's child, result and trend. Draft, reviewed and withdrawn
results must never appear.
```

**M9**
```
Do milestone M9. The school server core: SQLite with the required pragmas, migrations, first-run activation, device
secret storage, the sync agent (pull, packs with resume and verification, heartbeat, results upload with backoff),
the outbox, backups and the local audit log. Follow CBT-02 section 3 and CBT-03 sections 13 to 15. Run the crash
tests: kill -9 at random points 200 times and prove no corruption and no lost acknowledged write.
```

**M10**
```
Do milestone M10. The School Exam API (CBT-03 section 16) and the exam client (React, Vite, target chrome109, no
external URLs). Implement primary and secondary screens, the autosave engine with IndexedDB buffer and seq, resume,
timers, the review and submit flow, accessibility settings, and every student error message in CBT-03 section 2.
Prove: reload keeps order and answers, killing the server mid-exam loses nothing acknowledged, a second PC can take
over after 30 seconds, and no response contains answer keys.
```

**M11**
```
Do milestone M11. The invigilator console and Console API (CBT-03 section 17): PIN sign-in with lockout, readiness
checks in plain English, open and close sittings, live seats over WebSocket within 3 seconds, extra time, reset,
release seat, sync and backup controls, pack import, results export, PIN change and reset with the cloud code.
```

**M12**
```
Do milestone M12. The Windows service and installer as in CBT-04 section 6: bundled Node, WinSW service, Inno Setup
installer, firewall rule scoped to the local subnet, power settings, first-run page, code-signing step, silent install,
in-app update with automatic rollback, restore from backup and from the cloud. Build and test on a Windows runner.
Time the disaster-recovery drill and write the runbook.
```

**M13**
```
Do milestone M13. Finish the permission matrix, build the load test (60 and 150 clients) and the fault tests in
CBT-04 sections 7.4 and 7.5, run the security pass in 7.6, add monitoring, and write the runbooks. Report measured
results against every pass criterion. Fix what fails.
```

---

## 14. Non-negotiables and when to ask a human

### 14.1 Do not change without asking

- Offline exams: the exam client and school server never depend on the internet during a sitting.
- The cloud never connects to the school. The school server always calls out.
- Answer keys never reach a browser. They exist in plain form only inside the server process during marking.
- One writer per record: setup and content in the cloud, sessions and scores at the school.
- Role and tenant scoping happens in repositories and RLS, never only in the UI.
- Parents see only released results of linked children with `can_view_results`, and get `404` for anything else.
- No public sign-up. The school creates every account.
- The school server holds no parent data (BR-24).
- SQLite on the school server, PostgreSQL in the cloud. No Docker on the school server.
- Marking rules in API spec 14.5 and the code and key formats in section 4.

### 14.2 Ask a human when

- A requirement in the documents conflicts with itself in a way that changes behaviour a user would notice.
- You need a third-party account or paid service (email, SMS, WhatsApp provider, code-signing certificate, object storage).
- A change would alter the pack format, the sync protocol, or a table that already has data in production.
- The site survey results (document 05) contradict an assumption, for example a lab on Windows 7, a server PC below the minimum spec, or no wired network.
- You find a security issue in the design itself rather than in the code.
- A test cannot be made to pass without weakening the requirement.

### 14.3 Things deliberately left for later

Theory questions and manual marking, AI question drafts, camera proctoring, report cards and attendance, online (from home) exams, mobile apps, multi-language screens, multiple labs per school, multiple exam servers per school, fees (M14).
