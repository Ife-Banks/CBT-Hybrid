# Troubleshooting

| Symptom                                               | Cause                                       | Fix                                                           |
| ----------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `npm.ps1 cannot be loaded` (Windows)                  | PowerShell execution policy                 | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`         |
| `ERR_PNPM_IGNORED_BUILDS`                             | A dependency's build script is not approved | Add it under `allowBuilds` in `pnpm-workspace.yaml`           |
| `pnpm: command not found`                             | pnpm not installed                          | `npm install -g pnpm@12` or `corepack enable`                 |
| `check:offline` fails                                 | Built output references an external URL     | Remove the external URL, or proxy the asset locally           |
| Port already in use                                   | Previous dev server still running           | Stop it, or change the port in `.env`                         |
| `tsc` fails with `moduleResolution=node10 deprecated` | Old tsconfig                                | Extend `packages/config/tsconfig.base.json` (uses `NodeNext`) |
| CI `pnpm install` fails                               | Lockfile out of date                        | Run `pnpm install` locally and commit `pnpm-lock.yaml`        |

## Windows notes

- The dev services run in the cloud, so Docker/WSL2 is not needed.
- `pnpm dev` spawns several Node processes; use `pnpm dev:clean` then
  `pnpm dev` if a process is stuck.
