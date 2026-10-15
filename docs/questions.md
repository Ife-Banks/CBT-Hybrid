# Questions, conflicts and decisions

Running log. Newest entries first. Each entry names the source documents so the
decision can be re-checked later.

Precedence rules live in `CBT-04-Build-Specification.md` section 1.2.

---

## Phase 1

Where `CBT-Phase-1-Infrastructure.md` conflicts with
`CBT-04-Build-Specification.md` or `CBT-03-API-and-Sync-Specification (1).md`,
the latter two win (CBT-04 section 1.2 precedence).

### D.5 - Error envelope: `application/problem+json`  *(decided)*

- **Conflict.** Phase 1 task 4 sketches `{ error: { code, message, details,
  correlationId }, timestamp }`. The API spec (section 1.4) and CBT-04 require
  RFC 9457 `application/problem+json` with `type`, `title`, `status`, `code`,
  `detail`, `errors[]` and `request_id`.
- **Decision.** `application/problem+json` is canonical and is what both servers
  emit (global exception filter + rate-limit handler). `@cbt/shared-types`
  exports `ProblemDetailsSchema`; the Phase-1 shape is not implemented.

### D.6 - Student-code alphabet excludes `L`  *(decided)*

- **Conflict.** Phase 1 task 3 writes the alphabet as
  `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (32 chars, includes `L`). CBT-04 section 4.1
  (authoritative, with vectors) uses **31 chars**: `23456789ABCDEFGHJKMNPQRSTUVWXYZ`
  (excludes `0 1 I L O`).
- **Decision.** The 31-character set is implemented in `exam-core` and
  `shared-types`; the Phase 1 text is a typo. All section 4.1 vectors pass.

### D.7 - Multiple-choice marking is all-or-nothing  *(decided)*

- **Conflict.** Phase 1's marking section implies partial credit for
  multiple-choice. CBT-04 section 4.6 specifies **all-or-nothing** (exact set →
  full marks, subset/extra → 0).
- **Decision.** All-or-nothing, with a test asserting both a subset and a
  superset score 0.

### D.8 - Configuration variable names  *(decided)*

- **Conflict.** Phase 1 uses `CLOUD_API_PORT` and `S3_ACCESS_KEY_ID`/
  `S3_SECRET_ACCESS_KEY`. CBT-04 section 11 names `PORT`, `PUBLIC_URL`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY`.
- **Decision.** Use the CBT-04 names. Cloud API reads `PORT` (default 3000);
  school server reads `PORT` (default 8080), `CBT_DATA_DIR` (default `./data`).

### D.9 - NestJS tests use SWC, not esbuild  *(decided)*

- **Context.** NestJS dependency injection needs `emitDecoratorMetadata`
  (`design:paramtypes`). Vitest's default esbuild transform does not emit it, so
  constructing the Nest testing module fails to resolve dependencies.
- **Decision.** Both Nest apps compile tests with `unplugin-swc` +
  `@swc/core` (`vitest.config.mts` sets `legacyDecorator` and
  `decoratorMetadata`). `@swc/core` is allowed in `pnpm-workspace.yaml`
  (`allowBuilds`). Non-Nest packages keep the default esbuild transform.

### D.10 - TSConfig split: `tsconfig.json` vs `tsconfig.build.json`  *(decided)*

- **Context.** Tests (`*.spec.ts`) must be type-checked but must not be emitted
  into `dist`.
- **Decision.** `tsconfig.json` includes tests and is used by `typecheck`;
  `tsconfig.build.json` extends it, excludes `**/*.spec.ts`, and is used by
  `build`. Applied to `exam-core`, `shared-types`, `cloud-api`, `school-server`.

### D.11 - `common/` is duplicated across the two Nest apps  *(decided, revisit)*

- **Context.** `http-types.ts`, the exception filter, the logging interceptor
  and the logger service are near-identical in `cloud-api` and `school-server`.
- **Decision.** Kept per-app, matching the Phase 1 task structure (both apps get
  their own `common/`). A shared `packages/nest-common` would remove the
  duplication; revisit when a third Nest app appears or the plumbing changes.

### D.12 - School-server storage uses built-in `node:sqlite`  *(decided)*

- **Context.** The school server needs SQLite. `better-sqlite3` is a native
  module (build step, admin/toolchain risk on school PCs). Node 24 ships
  `node:sqlite` (`DatabaseSync`), verified working on this machine
  (Node v24.21.0).
- **Decision.** Use `node:sqlite`; no native build. WAL mode and foreign keys
  are enabled on open. Note the API is still marked experimental in Node 24 — if
  it changes, isolate the dependency behind `SqliteService`.

### D.13 - Health response extends the Phase 1 sketch  *(decided)*

- **Context.** Phase 1 sketches `{ status, timestamp, services }`; CBT-04 M0
  mentioned `{ status, version, db }`.
- **Decision.** One shared `HealthCheckSchema`: `{ status, service, version,
  timestamp, uptime, services: { <name>: { status, responseTime?, details? } } }`.
  Cloud API reports `database`/`redis` as `degraded` when unconfigured (they are
  wired in Phase 3); overall `status` is `error` only if a service is `error`.

### D.14 - Rate-limit responses are `problem+json`  *(decided)*

- **Context.** `express-rate-limit` runs as Express middleware, before Nest
  routing, so its default plain-text 429 would bypass the global exception
  filter. A request id also needs to exist before the limiter runs.
- **Decision.** A `request-id` middleware runs first (UUIDv7, reuses inbound
  `x-request-id`), and the limiter uses a custom handler that emits a
  `RATE_LIMITED` problem+json body. Limits: 100 requests / 60s per IP by default
  (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`).

### D.15 - Two copies of the API spec exist in `docs/`  *(decided)*

- **Conflict.** `CBT-03-API-and-Sync-Specification.md` and
  `CBT-03-API-and-Sync-Specification (1).md` both exist, committed as-is. The
  `(1)` copy matches the section 4 test vectors; the other copy's PIN-reset text
  ("first 8 digits … as a decimal number") is wrong.
- **Decision.** Treat the `(1)` copy as authoritative. Both files are left in
  place (pre-existing, not ours to delete). If the duplicate is removed later,
  the `(1)` content should be the one kept.

---

## Phase 0

### D.1 - Development database strategy: cloud services instead of Docker  *(decided)*

- **Context.** `CBT-Phase-0-Foundation.md` Task 2 specifies a
  `docker-compose.dev.yml` running Postgres 15, Redis 7, MinIO, Mailpit and
  Adminer. The development machine is not an administrator, so Docker Desktop's
  WSL2 backend cannot be enabled (enabling `VirtualMachinePlatform` requires
  elevation and a reboot).
- **Decision.** Development uses managed cloud services: **Neon** (Postgres),
  **Upstash** (Redis), **Cloudflare R2** (S3-compatible object storage).
  `.env.example` and `scripts/dev-setup.mjs` document and validate these. No
  local containers.
- **Consequence.** Phase 0 Task 2 is satisfied by configuration + docs rather
  than a Compose file. Postgres-specific features (extensions such as
  `uuid-ossp`, `citext`, `pg_trgm`, `btree_gin`) must be verified against Neon
  when Phase 3 starts; if Neon cannot enable one, fall back to a locally
  installed portable Postgres or a different provider.

### D.2 - Single toolchain in CI: Node 24, no 18/20 matrix  *(decided)*

- **Context.** `CBT-Phase-0-Foundation.md` Task 3 specifies a CI matrix of
  "Node.js 18 and 20". Node 18 is end-of-life and the workspace requires Node
  >= 24.
- **Decision.** CI runs a single Node 24. Tracked as a divergence from the
  phase text.

### D.3 - ESLint flat config lives at the repository root  *(decided)*

- **Context.** `CBT-Phase-0-Foundation.md` wants shared ESLint config in
  `packages/config`. In flat config, `ignores` patterns resolve relative to the
  file that declares them, so a shared config in a sub-package mis-ignores
  paths.
- **Decision.** The repo-wide config is `eslint.config.mjs` at the root.
  `packages/config` holds `tsconfig.base.json`. Documented in
  `packages/config/README.md`.

### D.4 - `cloud-web` and `exam-client` are static placeholders in Phase 0  *(decided)*

- **Context.** The Phase 0 structure lists both apps, but their real stacks
  (Next.js; React + Vite) are not needed for any Phase 0 acceptance test and
  would pull large dependency trees in.
- **Decision.** Phase 0 ships minimal static placeholders with `build`
  (`copy-static`) and `dev` (`serve-static`) scripts. The frameworks are added
  when those apps first need real behaviour. `exam-client`'s `chrome109` target
  and the `check:offline` rule are already encoded and enforced.

### Q.1 - Authentication mechanism: JWT vs HttpOnly cookie sessions  *(open - matters in Phase 2)*

- **Conflict.** `CBT-Phase-2-Authentication.md` describes JWT access tokens
  (15 min) + refresh tokens. The locked Technical Design uses HttpOnly cookie
  sessions (`__Host-cbt_session`, `__Host-cbt_refresh`, `HttpOnly; Secure;
  SameSite=Lax`).
- **Status.** Not resolved. Phase 0 does not depend on it. Decide before Phase 2
  code. The Technical Design is "locked", so the default is cookie sessions; the
  Phase 2 text would need correcting.

### Q.2 - ORM: TypeORM vs Drizzle  *(open - matters in Phase 3)*

- **Conflict.** `CBT-Build-Phases-Overview.md` says "Drizzle/TypeORM entities";
  `CBT-Phase-3-*.md` and the Technical Design both use **Drizzle**.
- **Status.** Not resolved. Default is Drizzle (majority of documents +
  Technical Design). Confirm before Phase 3.

### Q.3 - Scale and team assumptions  *(open - planning only)*

- **Conflict.** The phase plan assumes 4–5 developers over 12–14 weeks and 200+
  (elsewhere 10,000+) concurrent students. The proposal assumes a small team
  over ~3 months with NFRs of 60 comfortable / 150 tested concurrent students.
- **Status.** Not code-affecting now. Flagged for capacity planning.

### Q.4 - TypeScript project references not used  *(decided, revisit)*

- **Context.** `CBT-Phase-0-Foundation.md` Task 1 mentions TypeScript project
  references. Turborepo's `build`/`typecheck`/`test` pipelines already provide
  topological ordering (`dependsOn: ["^build"]`), which achieves the same
  guarantee with less configuration.
- **Decision.** Use Turborepo ordering; omit TS project references for now.
  Revisit if editor/`tsc -b` performance needs it.
