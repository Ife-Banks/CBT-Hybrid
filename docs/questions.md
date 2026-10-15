# Questions, conflicts and decisions

Running log. Newest entries first. Each entry names the source documents so the
decision can be re-checked later.

Precedence rules live in `CBT-04-Build-Specification.md` section 1.2.

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
