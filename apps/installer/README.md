# @cbt/installer

Windows service and installer for the school exam server.
Spec: [`docs/CBT-04-Build-Specification.md`](../../docs/CBT-04-Build-Specification.md) section 6 (milestone M12).

This package is a thin, deterministic wrapper around three things:

1. **`build.mjs`** — assembles `staging/`, the exact tree section 6.1 describes.
2. **`SchoolCBT.xml`** — the WinSW service definition (section 6.2).
3. **`installer.iss`** — the Inno Setup script (section 6.3).

## What gets installed

```
C:\Program Files\SchoolCBT\
   node.exe            Node.js runtime (copied from the build machine)
   app\server.cjs      bundled school server (esbuild)
   app\migrations\     drizzle migrations (SCHOOL_MIGRATIONS_DIR)
   app\console\        static console page
   app\exam-client\    static exam client
   app\node_modules\   better-sqlite3 and argon2 prebuilt for this Node
   SchoolCBT.exe       WinSW service wrapper
   SchoolCBT.xml       WinSW configuration
   tools\              firewall / power / shortcut / update / restore helpers
   lab\                generated lab-PC shortcut files

C:\ProgramData\SchoolCBT\
   data\school.db      SQLite database (WAL files alongside)
   backups\            database backups: school-*.db, pre-update\, pre-migration\, pre-restore\
   logs\               service logs
   secrets\            (reserved for the DPAPI device secret)
   config.json         port, cloud URL, second backup path (no secrets)
```

Data lives under `%ProgramData%` so the service (running as `LocalService`)
never needs to write inside Program Files.

## Prerequisites

- **Node.js 24** (matches `.nvmrc`). The runtime is copied from the build
  machine, and better-sqlite3 / argon2 are prebuilt for its ABI, so the target
  PC needs no compiler, Python or internet.
- **pnpm** (workspace build).
- **[Inno Setup 6](https://jrsoftware.org/isdl.php)** — only to compile the
  installer, not to assemble the tree. `ISCC.exe` is found under
  `Program Files (x86)`, `Program Files`, or the per-user
  `%LOCALAPPDATA%\Programs\Inno Setup 6` (where winget installs it), or via the
  `INNO_SETUP_ISCC` environment variable. `winget install JRSoftware.InnoSetup`
  works.
- **[WinSW](https://github.com/winsw/winsw/releases)** — download
  `WinSW-x64.exe` and save it as `apps/installer/vendor/SchoolCBT.exe`
  (git-ignored). The build warns and continues without it; the installer cannot
  be compiled until it is present.

## Build and compile

```powershell
# 1. Assemble staging/ (builds the school server and its workspace deps first)
pnpm --filter @cbt/installer package:win

#    ...or, if the workspace is already built:
pnpm --filter @cbt/installer package:win:fast

# 2. Compile the setup executable
pnpm --filter @cbt/installer compile
# -> apps/installer/output/SchoolCBT-Setup-<version>.exe
```

## Service management (on a target PC)

```powershell
& 'C:\Program Files\SchoolCBT\SchoolCBT.exe' install
& 'C:\Program Files\SchoolCBT\SchoolCBT.exe' start
& 'C:\Program Files\SchoolCBT\SchoolCBT.exe' stop
& 'C:\Program Files\SchoolCBT\SchoolCBT.exe' uninstall
```

The installer runs these for you, and the uninstaller stops and removes the
service. Uninstalling keeps `C:\ProgramData\SchoolCBT` so exam results are not
lost.

## Installer behaviour

- Refuses anything below Windows 10 x64.
- If TCP 8080 is taken, prompts for another port and writes it to both
  `SchoolCBT.xml` (the service `PORT` env) and `ProgramData\SchoolCBT\config.json`.
- On upgrade: stops and removes the old service, backs up `school.db` to
  `backups\pre-update-<timestamp>.db`, then replaces files and re-registers. An
  upgrade keeps the port the service is already configured for, which the silent
  update path relies on.
- Adds the firewall rule scoped to `LocalSubnet` (task, on by default).
- Disables sleep/hibernate and disk sleep on AC (task, on by default).
- Writes the lab-PC shortcut files (task, on by default).
- Opens `http://localhost:<port>/setup` on the finish page.

## In-app updates (section 6.4)

The exam server checks the cloud's heartbeat for a newer release, downloads it to
`%ProgramData%\SchoolCBT\data\updates\`, verifies its SHA-256 and waits. The
console API drives it:

```
GET  /api/v1/console/updates            status: offer, staged package, what blocks applying
POST /api/v1/console/updates/check      ask the cloud (heartbeat)
POST /api/v1/console/updates/download   download and verify the offered release
POST /api/v1/console/updates/apply      hand off to the updater (409 while a sitting is open)
```

Applying is refused with `409 CONFLICT` while a sitting is `open` or starts within
two hours. With `AUTO_UPDATE=true` the server stages and applies on its own timer
(`UPDATE_CHECK_MINUTES`, default 5) once no sitting is in the way.

The service runs as `LocalService`, so it cannot replace its own files under
Program Files. `POST /updates/apply` therefore asks for elevation on
`updates\SchoolCBT-Update.cmd`, which runs `tools\apply-update.ps1`:

1. stops the service;
2. backs up the database and the mutable part of the install folder
   (`app\`, `node.exe`, `SchoolCBT.xml`, `VERSION.txt`) to `backups\pre-update\`;
3. runs the downloaded installer silently (`/VERYSILENT /TASKS=""`);
4. starts the service and polls `/api/v1/exam/status` for 60 seconds;
5. on failure stops the service, restores the backup, restarts and records
   `update_failed` in `updates\last-result.json`, which the server reports in its
   next heartbeat. Migrations are forward-only, so the rollback restores the
   pre-update database rather than migrating back down.

A UAC prompt needs a desktop, so when the server has no interactive session the
apply call reports the refusal and the operator runs
`%ProgramData%\SchoolCBT\data\updates\SchoolCBT-Update.cmd` as administrator.

## Backups and restore (section 6.6, US-15.4 and US-15.5)

The server copies its database with the SQLite backup API — safe while exams are
running — after every sitting closes and nightly at 22:00. Copies land in
`C:\ProgramData\SchoolCBT\backups` as `school-<YYYYMMDD-HHmmss>.db`, are
checksummed, copied to the second backup location when one is set, and trimmed to
the newest 30. A copy is also taken before a schema migration
(`backups\pre-migration`). `BACKUP_CHECK_MINUTES` (default 15, 0 disables the
timer), `BACKUP_HOUR` (default 22) and `BACKUP_RETENTION` (default 30) tune it.

```
GET  /api/v1/console/backups        every backup with size and checksum
POST /api/v1/console/backup/now     take one now
GET  /api/v1/console/restore        candidates, what blocks a restore, last result
POST /api/v1/console/restore        restore a backup (409 while a sitting is open)
```

A restore is refused while a sitting is `open` or starts within two hours. It is
only accepted from a file inside a backup folder, so a USB copy is moved into
`backups\` first. The service then writes `backups\SchoolCBT-Restore.cmd` and asks
for elevation on it, and `tools\restore-backup.ps1`:

1. checks the file is a SQLite database;
2. stops the service;
3. copies the current database to `backups\pre-restore\` (newest 3 kept);
4. removes the `-wal`/`-shm` files and copies the backup over `school.db`;
5. starts the service and polls `/api/v1/exam/status` for 60 seconds;
6. on failure puts the safety copy back, restarts and records `restore_failed` in
   `backups\last-restore.json`.

As with updates, an operator with no interactive session runs
`%ProgramData%\SchoolCBT\backups\SchoolCBT-Restore.cmd` as administrator. The
written procedure, including replacing a dead PC and recovering from a failed
update, is [`docs/runbooks/recovery.md`](../../docs/runbooks/recovery.md).

`GET /health` reports a `backup` check (failed, missing or older than 48 hours),
and `GET /health/details` adds the database integrity check.

## Code signing (section 6.5)

Sign `SchoolCBT.exe`, the updater and the installer with a timestamping
certificate. In Inno Setup configure a `SignTool` and uncomment the `SignTool`
line in `installer.iss`. Unsigned builds work but trigger SmartScreen and
antivirus warnings; document the "More info → Run anyway" step in the runbook
until a certificate is available.

## Not yet implemented (deferred M12 items)

- The cloud side of backups: `PUT /sync/v1/backups/:name` and
  `GET /sync/v1/backups/latest` (API spec 13.9). A spare PC with no local backup
  therefore cannot be recovered from the cloud yet; use the second backup
  location as the off-machine copy.
- Automated install tests on Windows 10/11 VMs with Defender and a third-party
  antivirus (the section M12 acceptance tests). The update rollback and the
  restore helper in particular still have to be exercised on a VM.
- The console's Apply and Restore buttons (the invigilator console UI is a later
  milestone); the update, backup and restore endpoints are reachable directly for
  now.
- The QR code on the `/setup` page. The page itself, the console PIN, the second
  backup path and activation are implemented; the server address and the lab
  shortcut downloads stand in for the QR code for now.

## Verifying the bundle

`build.mjs` produces a self-contained `staging/app/server.cjs`. To smoke-test it
before packaging:

```powershell
$env:CBT_DATA_DIR = "$env:TEMP\cbt-smoke"
$env:SCHOOL_MIGRATIONS_DIR = "$PWD\apps\installer\staging\app\migrations"
node apps/installer/staging/app/server.cjs
# then: curl http://localhost:8080/health
```
