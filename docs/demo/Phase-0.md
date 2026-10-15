# Phase 0 demo - Foundation

What to show that the foundation works.

## 1. Clean install and full verification

```bash
rm -rf node_modules
pnpm install
pnpm verify
```

Expected: `pnpm install` completes; `pnpm verify` runs lint, typecheck, tests,
build and the offline check with no failures.

## 2. Every app starts

```bash
pnpm dev
```

Then:

| App | URL | Expected |
|---|---|---|
| cloud-api | http://localhost:3000/health | `{"status":"ok","service":"cloud-api",...}` |
| school-server | http://localhost:8080/health | `{"status":"ok","service":"school-server",...}` |
| cloud-web | http://localhost:3001 | placeholder portal page |
| exam-client | http://localhost:5173 | placeholder client page |

## 3. The offline rule is enforced

Add an external link to `apps/exam-client/public/index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet" />
```

```bash
pnpm --filter @cbt/exam-client build
pnpm check:offline
```

Expected: `check:offline` exits `1` and names the offending URL. Remove the link,
rebuild, and it passes again.

## 4. CI

Open a pull request. The `CI` workflow runs lint, typecheck, test and
build+offline-check jobs; `Security` runs CodeQL and an audit.
