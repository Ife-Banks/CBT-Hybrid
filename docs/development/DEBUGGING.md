# Debugging

## VS Code

`.vscode/launch.json` provides two launch configurations:

- **cloud-api (dev)** - runs `pnpm --filter @cbt/cloud-api dev` with the debugger attached.
- **school-server (dev)** - the same for the school server.

Set breakpoints in `src/**` and start the relevant configuration.

## Logs

Application logs are printed by `pnpm dev` in the terminal. Managed services
(Neon, Upstash, R2) expose their own logs:

```bash
pnpm dev:logs
```

## Turborepo

- `pnpm build --force` bypasses the cache.
- `pnpm dev:clean` removes `dist`, `.turbo` and coverage output.
- Task definitions live in `turbo.json`.

## A single package

```bash
pnpm --filter @cbt/exam-core test
pnpm --filter @cbt/cloud-api dev
```

## TypeScript

The workspace uses TypeScript 6 with ESLint 10. If lint and the compiler
disagree, `pnpm typecheck` is authoritative for types and `pnpm lint` for style.
