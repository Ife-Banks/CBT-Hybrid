# Phase 1 demo - Core Infrastructure

What to show that the cloud API, school server and the shared algorithm/types
packages work.

## 1. Clean install and full verification

```bash
pnpm install
pnpm verify
```

Expected: `pnpm verify` runs lint, typecheck (including tests), all test suites,
build and the offline check with no failures. Test counts at this phase:

| Package | Tests |
|---|---|
| `@cbt/exam-core` | 66 |
| `@cbt/shared-types` | 9 |
| `@cbt/cloud-api` | 11 |
| `@cbt/school-server` | 10 |

## 2. Cloud API starts and is hardened

```bash
pnpm --filter @cbt/cloud-api dev
```

```bash
curl -i http://localhost:3000/health
```

Expected: `200`, a `x-request-id` header (UUIDv7), helmet security headers and a
JSON body shaped like:

```json
{
  "status": "ok",
  "service": "cloud-api",
  "version": "0.0.0",
  "timestamp": "2026-...Z",
  "uptime": "0m 3s",
  "services": {
    "database": { "status": "degraded", "details": "not configured" },
    "redis": { "status": "degraded", "details": "not configured" },
    "memory": { "status": "ok", "details": "58MB of 16384MB" }
  }
}
```

`database`/`redis` are `degraded` until Phase 3 wires them in; the overall
`status` is still `ok`.

## 3. Errors are `application/problem+json`

```bash
curl -i http://localhost:3000/does-not-exist
```

Expected: `404` and `Content-Type: application/problem+json`, with a body whose
`request_id` matches the `x-request-id` response header:

```json
{
  "type": "https://docs.cbt.example/errors/not-found",
  "title": "Not found",
  "status": 404,
  "code": "NOT_FOUND",
  "detail": "Cannot GET /does-not-exist",
  "request_id": "01a0..."
}
```

## 4. Configuration fails fast

```bash
PORT=not-a-number node apps/cloud-api/dist/main.js
```

Expected: the process exits immediately with
`Invalid environment configuration: PORT: ...`.

## 5. Rate limiting

```bash
for i in $(seq 1 120); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health; done | sort | uniq -c
```

Expected: the first 100 are `200`, the rest are `429`. A `429` body is
`application/problem+json` with `"code": "RATE_LIMITED"`.

## 6. School server starts and prepares storage

```bash
pnpm --filter @cbt/school-server dev
curl -s http://localhost:8080/health
```

Expected: `status: "ok"` with `database`, `filesystem` and `memory` all `ok`.
The data directory (`./data`, or `CBT_DATA_DIR`) now contains:

```
data/
├── school.db          (SQLite, WAL mode)
├── school.db-wal
├── school.db-shm
└── exam-packs/
    ├── pending/
    ├── active/
    ├── completed/
    └── archive/
```

## 7. exam-core reproduces the CBT-04 section 4 vectors

```bash
pnpm --filter @cbt/exam-core test
```

Expected: 66 passing tests, including the exact vectors:

- student code `7K2M9QXD` -> check `G` (`GRA-7K2M9QXDG`) and
  `K7M2P9QX -> W`, `22222222 -> 2`, `ZZZZZZZZ -> 6`, `M4R8T2VX -> Y`
- `mulberry32(12345)` -> `4207900869, 1317490944, 2079646450`
- `shuffle(A..J, 12345)` -> `GEIABHFDCJ`
- sync signature `937eb643235c...` (HMAC-SHA256)
- PIN reset `13232082`
- HKDF-SHA256 `277a3953...`
- `percent(1, 3) = 33.33`, `percent(2, 3) = 66.67`

## 8. Shared types validate payloads

```bash
pnpm --filter @cbt/shared-types test
```

Expected: 9 passing tests covering the error catalogue, `problem+json`, health,
student-code and exam-key shapes, and marking keys.
