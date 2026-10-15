# Development setup

## 1. Toolchain

| Tool    | Version       | Notes                                          |
| ------- | ------------- | ---------------------------------------------- |
| Node.js | 24 (`.nvmrc`) | `engines.node >= 24`                           |
| pnpm    | 12            | `npm install -g pnpm@12`, or `corepack enable` |
| Git     | any recent    |                                                |

On Windows, if `npm` fails with an execution-policy error, allow locally signed
scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 2. Install

```bash
pnpm install
```

pnpm blocks dependency build scripts by default. `esbuild` is approved in
`pnpm-workspace.yaml` (`allowBuilds`). If a new dependency needs a build script,
add it there.

## 3. Development services (cloud)

Development uses managed cloud services, so no local Docker is required.

| Service        | Provider                                              | Purpose                      |
| -------------- | ----------------------------------------------------- | ---------------------------- |
| PostgreSQL     | [Neon](https://neon.tech)                             | cloud database               |
| Redis          | [Upstash](https://upstash.com)                        | cache, rate limiting, BullMQ |
| Object storage | [Cloudflare R2](https://developers.cloudflare.com/r2) | question assets and uploads  |

1. Create the three services.
2. `pnpm dev:setup` copies `.env.example` to `.env` and reports what is missing.
3. Fill in `DATABASE_URL`, `REDIS_URL` and the `S3_*` values.
4. Re-run `pnpm dev:setup` until it reports everything present.

These services are not yet consumed by any code (that starts in Phase 2/3); the
configuration and validation scaffolding is in place now.

## 4. Run

```bash
pnpm dev
```

| App           | URL                          |
| ------------- | ---------------------------- |
| cloud-api     | http://localhost:3000/health |
| school-server | http://localhost:8080/health |
| cloud-web     | http://localhost:3001        |
| exam-client   | http://localhost:5173        |

## 5. Verify

```bash
pnpm verify
```

Runs lint, typecheck, tests, build, and the offline check.
