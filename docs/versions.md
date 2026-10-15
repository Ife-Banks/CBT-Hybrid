# Tool and dependency versions

Pinned in Phase 0; extended in Phase 1 (exam-core, HTTP hardening). Update
deliberately, one change at a time, and re-run `pnpm verify`.

## Runtimes

| Tool | Version | Where |
|---|---|---|
| Node.js | 24 (`.nvmrc`, `engines.node >= 24`) | root `package.json` |
| pnpm | 12.11.2 (`packageManager`) | root `package.json` |

## Root devDependencies

| Package | Version |
|---|---|
| typescript | 6.0.3 |
| turbo | 2.11.8 |
| prettier | 3.9.10 |
| eslint | 10.12.0 |
| typescript-eslint | 8.71.2 |
| @eslint/js | 10.0.1 |
| eslint-config-prettier | 10.1.8 |
| globals | 17.13.0 |
| @types/node | 26.6.5 |

## Workspace dependencies

| Package | Version | Used by |
|---|---|---|
| zod | 4.6.7 | shared-types, cloud-api, school-server |
| libphonenumber-js | 1.13.15 | exam-core (phone normalisation) |
| @nestjs/common | 12.1.3 | cloud-api, school-server |
| @nestjs/core | 12.1.3 | cloud-api, school-server |
| @nestjs/platform-express | 12.1.3 | cloud-api, school-server |
| @nestjs/testing | 12.1.3 | cloud-api, school-server |
| reflect-metadata | 0.2.2 | cloud-api, school-server |
| rxjs | 7.8.2 | cloud-api, school-server |
| helmet | 8.3.0 | cloud-api, school-server |
| express-rate-limit | 8.7.1 | cloud-api |
| pino | 10.4.0 | cloud-api, school-server |
| vitest | 5.0.4 | libs, servers |
| tsx | 4.23.15 | servers (dev) |
| supertest | 7.3.1 | servers (tests) |
| @swc/core | 1.16.18 | cloud-api, school-server (tests) |
| unplugin-swc | 2.0.0 | cloud-api, school-server (tests) |

## Notes

- **TypeScript is 6.0.3, not 7.x.** TypeScript 7.0.2 is the current `latest`,
  but `typescript-eslint@8.71.2` declares `typescript >=4.8.4 <6.1.0`.
  TypeScript 6.0.3 is the newest release the linter supports. Revisit when
  typescript-eslint supports TS 7.
- **`libphonenumber-js`** is used by `exam-core` for phone normalisation
  (default region `NG`, foreign numbers accepted by default). It is a pure-JS
  package (no native build).
- **`@swc/core` + `unplugin-swc`** exist only to give Vitest the
  `emitDecoratorMetadata` transform NestJS DI needs (see `questions.md` D.9).
  `@swc/core` is allow-listed in `pnpm-workspace.yaml` because it runs a
  postinstall.
- **`node:sqlite`** (Node's built-in, used by the school server) is still
  flagged experimental in Node 24. No npm dependency is added; access is isolated
  behind `SqliteService` (see `questions.md` D.12).
