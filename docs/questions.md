# Questions, conflicts and decisions

Running log. Newest entries first. Each entry names the source documents so the
decision can be re-checked later.

Precedence rules live in `CBT-04-Build-Specification.md` section 1.2.

---

## Phase 2

Where `CBT-Phase-2-Authentication.md` conflicts with
`CBT-04-Build-Specification.md` or `CBT-03-API-and-Sync-Specification (1).md`,
the latter two win (CBT-04 section 1.2 precedence). The Phase 2 document is the
weakest of the three: its acceptance checks call a `/auth/register` endpoint that
does not exist, send `Authorization: Bearer` tokens that contradict the cookie
design, and use `/auth/mfa/*` where the API spec says `/auth/2fa/*`.

### D.16 - Auth mechanism: HttpOnly cookie sessions, not JWT  *(decided; resolves Q.1)*

- **Conflict.** `CBT-Phase-2-Authentication.md` describes 15-minute JWT access
  tokens plus refresh tokens. CBT-04 section 3.6 and the API spec (sections 1.1,
  1.3) use server-side sessions carried in an HttpOnly cookie.
- **Decision.** Cookie sessions. The cookie holds a random 32-byte token; the
  `sessions` table stores only its SHA-256. Staff sessions live 12h; parent
  sessions live 30 days and slide on activity (API spec section 20). No JWT is
  issued.
- **CSRF.** Double-submit: a readable `cbt_csrf` cookie must equal the
  `X-CSRF-Token` header *and* match a value derived as
  `HMAC-SHA256(SESSION_SECRET, "csrf:" + sessionId)`, so a forged cookie alone is
  not enough. Required on every unsafe method (POST/PUT/PATCH/DELETE).
- **Consequence.** Cookie names are `cbt_session`/`cbt_csrf`, not the
  `__Host-cbt_session`/`__Host-cbt_refresh` names in the Phase 0 Technical
  Design digest; `__Host-` requires `Secure` + no `Domain` + `Path=/` and would
  break plain-HTTP local development. Revisit the `__Host-` prefix when the
  public URL is HTTPS-only.

### D.17 - Password policy follows the API spec, not the Phase 2 document  *(decided)*

- **Conflict.** The Phase 2 document adds composition rules (upper/lower/digit/
  symbol) and a password-reuse history. The API spec (section 3) sets only:
  at least 10 characters, not in the common-password list, and not equal to the
  user's email or phone.
- **Decision.** Implement the API-spec rule (`validatePassword` in
  `@cbt/shared-types`), returned as field errors with codes `TOO_SHORT`,
  `TOO_LONG`, `TOO_COMMON`, `SAME_AS_IDENTIFIER`. No composition or history rules.
- **Hashing.** argon2id with `m=19456 KiB, t=2, p=1` (CBT-04 section 3.6), via the
  `argon2` package (node-argon2).

### D.18 - CASL is the single authorization source  *(decided)*

- **Context.** The API spec (sections 1.3, 19) and CBT-04 section 3.7 make CASL
  authoritative for the role/subject matrix.
- **Decision.** The matrix lives once in `@cbt/shared-types` (`ROLE_ABILITIES`,
  `SCHOOL_SCOPED_SUBJECTS`) and `AbilityFactory` turns a user into an ability.
  School-owned subjects get a `{ school_id }` condition for every role except
  `platform_owner`, so a request can never read another tenant's rows.
- **Note.** CASL v7 removed `PureAbility`; the app uses `createMongoAbility`
  (`MongoAbility<[Action, Subject]>`). The typed rule-builder generics collapse
  the conditions type to `never`, so the factory builds raw rules and the unit
  tests widen only for condition assertions.
- **Two-step verification is admin-only** by an explicit service check
  (`ADMIN_ROLES`), not a CASL rule: it is an operation on the caller's own
  account, which is not one of the matrix subjects.

### D.19 - Two-step verification routes and no self-registration  *(decided)*

- **Conflict.** The Phase 2 document uses `/auth/mfa/{setup,verify,disable}` and
  an open `/auth/register`.
- **Decision.** Routes are `/auth/2fa/{setup,enable,disable}` (API spec section
  3). Accounts are created by invitation (a later phase) and by the seed script;
  there is **no** `/auth/register`. The login `totp` field accepts a 6-digit
  authenticator code or an `XXXXX-XXXXX` recovery code.

### D.20 - Auth repositories are in-memory until Phase 3  *(decided)*

- **Context.** Phase 2 must not depend on the database (Phase 3 is the data
  layer). Handlers need persistence to run end-to-end.
- **Decision.** `UserRepository`, `SessionRepository` and
  `OtpChallengeRepository` are interfaces provided by in-memory classes. The
  Drizzle implementations bind to the same interfaces in Phase 3; nothing else
  changes. Codes are delivered by a `LoggingNotifier` (logs the code outside
  production); the email/SMS transports are a later phase.

### D.21 - Risk-assessment engine deferred  *(decided)*

- **Context.** The Phase 2 document describes a "risk assessment" step
  (new device, impossible travel). It appears nowhere in CBT-04 or the API spec.
- **Decision.** Not implemented. The `audit_events`-style logging is kept (an
  in-process `AuditService`) so behaviour is observable, but no risk scoring or
  step-up flow ships in Phase 2. Revisit only if a later spec introduces it.

### D.22 - Cloud API serves under `/api/v1`  *(decided)*

- **Context.** The Phase 1 app served `/health` at the root; the API spec
  (section 1.1) prefixes API routes with `/api/v1`.
- **Decision.** `main.ts` sets a global prefix `api/v1` and excludes `/health`
  (the monitoring probe stays at the root). Rate limiting for sign-in is mounted
  on `/api/v1/auth/login` (API spec section 1.7: 10 attempts/minute per IP),
  alongside the global 100/60s limiter.

### D.23 - `cookie-parser` is not used  *(decided)*

- **Context.** NestJS examples add `cookie-parser` middleware; the package was
  installed and then removed.
- **Decision.** Cookies are parsed and written by a small module
  (`http/cookies.ts`) that also memoises the parse on the request. This keeps the
  dependency surface smaller and makes cookie attributes (HttpOnly, Secure,
  SameSite, Max-Age) explicit in one place.

### D.24 - Development accounts are seeded from `AUTH_DEV_SEED`  *(decided)*

- **Context.** Phase 2 has no registration endpoint and keeps users in memory, so
  a freshly started instance has nobody to sign in as. The Phase 2 document
  assumes an open `/auth/register` (D.19) that does not exist.
- **Decision.** `DevSeedService` inserts accounts at startup from a JSON array in
  `AUTH_DEV_SEED` (see `.env.example`). It is a no-op in production, skips
  accounts that already exist and validates each password against the policy.
  This is replaced by the school/invitation seeding in Phase 3.
- **Also.** A blank `SESSION_SECRET` (e.g. from a copied `.env.example`) is
  treated as unset rather than failing the `min(16)` check, matching how blank
  ports and URLs are handled.

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

### Q.1 - Authentication mechanism: JWT vs HttpOnly cookie sessions  *(resolved - see D.16)*

- **Conflict.** `CBT-Phase-2-Authentication.md` describes JWT access tokens
  (15 min) + refresh tokens. The locked Technical Design uses HttpOnly cookie
  sessions (`__Host-cbt_session`, `__Host-cbt_refresh`, `HttpOnly; Secure;
  SameSite=Lax`).
- **Decision.** Resolved in Phase 2: HttpOnly cookie sessions (no JWT). See
  **D.16** for the cookie names, lifetimes and CSRF scheme.

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
