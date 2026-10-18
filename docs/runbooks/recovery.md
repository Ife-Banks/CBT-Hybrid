# Recovery guide: backups, restores and updates

Spec: [`CBT-04-Build-Specification.md`](../CBT-04-Build-Specification.md) section 6.6 (M12) and
[`CBT-02-Data-Model.md`](../CBT-02-Data-Model.md). Audience: the school's exam officer or whoever
is on site when something has gone wrong. It assumes no knowledge of the code.

Everything below works offline. Nothing here sends results anywhere.

## Where things live

```
C:\Program Files\SchoolCBT\            the program (service wrapper, app bundle, tools)
C:\ProgramData\SchoolCBT\
   data\school.db                      the live database (results live here)
   data\school.db-wal, -shm            SQLite write-ahead log files
   backups\school-<stamp>.db           automatic backups (the newest 30 are kept)
   backups\pre-update-<stamp>.db       taken by the installer before an upgrade
   backups\pre-migration\              taken before a schema migration
   backups\pre-restore\                taken before a restore (last 3 kept)
   backups\SchoolCBT-Restore.cmd       helper written by a restore request
   backups\last-restore.json           what the last restore did
   data\updates\                       downloaded updates
   data\updates\last-result.json       what the last update did
   logs\                               service and helper logs
   config.json                         port, cloud URL, second backup path
```

Backups are full copies of `school.db`: roster, exams, sittings, answers, results, the outbox and
the audit log. They never contain guardian data.

## Rule zero

**Do not start any of this while a sitting is open.** The console refuses a restore when a sitting
is `open` or starts within two hours, and the helper stops the service, so every exam client is
disconnected while it runs. If you must go ahead during an exam, accept that the students lose
their connection and their in-progress answers since the last save are only on their PC.

## 1. Restore the newest backup (database looks wrong, server runs)

Use this when the server answers but the data is wrong or incomplete.

1. Open `http://localhost:<port>/setup` or `http://<server-ip>:<port>/setup` from a PC on the school
   network and find the port in `C:\ProgramData\SchoolCBT\config.json` if you are unsure.
2. Take a fresh backup first, so the current state is preserved:
   `curl -X POST http://localhost:<port>/api/v1/console/backup/now`
3. List what is available:
   `curl http://localhost:<port>/api/v1/console/restore`
   Each entry shows the file name, when it was taken, its size and its SHA-256.
4. Start the restore with the file name from step 3:
   ```
   curl -X POST http://localhost:<port>/api/v1/console/restore ^
     -H "Content-Type: application/json" ^
     -d "{\"backup\":\"school-20261018-221530.db\"}"
   ```
   `202` means the helper has started. `409` means a sitting is in the way; close it and retry.
5. A UAC prompt may appear. If it does not — the service runs as `LocalService` and has no desktop —
   the response says elevation was refused. In that case right-click
   `C:\ProgramData\SchoolCBT\backups\SchoolCBT-Restore.cmd` and choose **Run as administrator**.
6. The helper takes a safety copy in `backups\pre-restore\`, replaces `school.db`, restarts the
   service and waits for `http://127.0.0.1:<port>/api/v1/exam/status` to answer for up to 60
   seconds. If the server does not come back it puts the safety copy back and reports
   `restore_failed`.
7. Read the outcome: `curl http://localhost:<port>/api/v1/console/restore` shows `last_result`, and
   `backups\last-restore.json` holds the same JSON. `logs\restore-backup.log` has the step-by-step
   log.
8. Check the roster and a few results in the console, then confirm the next snapshot is being taken
   (`backups\school-*.db` gains a file after the next sitting closes).

## 2. Restore from the second backup location or a USB copy

The second location is set on the `/setup` page (usually a USB drive or a mapped share such as
`E:\SchoolCBT-Backups`). Copies there have the same names as the local ones.

1. Copy the file you want into `C:\ProgramData\SchoolCBT\backups\`. A restore only reads from the
   backup folders, so a file still on the USB stick is refused with `VALIDATION_FAILED`.
2. Follow section 1 from step 3.

If the second location is not plugged in, the local backups are unaffected; only the copy step warns
in `logs\`.

## 3. Replace a dead PC (the machine will not boot)

Target: an exam-ready server again within an hour, using only this guide.

1. **Get the data.** Take the disk out of the dead PC and copy
   `C:\ProgramData\SchoolCBT\backups\school-<newest>.db` onto a USB stick, or use the copy on the
   second backup location. If neither exists, see "Cloud restore" below.
2. **Install.** On the spare PC, run `SchoolCBT-Setup-<version>.exe` from the
   `SchoolCBT-Setup` folder on the stick. Keep the default port unless it is taken. Let it add the
   firewall rule and the power settings.
3. **Stop the service** so nothing writes during the copy:
   `& 'C:\Program Files\SchoolCBT\SchoolCBT.exe' stop`
4. **Put the database in place.** Copy the backup to `C:\ProgramData\SchoolCBT\data\school.db`,
   overwriting the empty one the installer made. Delete `school.db-wal` and `school.db-shm` if they
   exist:
   ```powershell
   Copy-Item E:\school-20261018-221530.db 'C:\ProgramData\SchoolCBT\data\school.db' -Force
   Remove-Item 'C:\ProgramData\SchoolCBT\data\school.db-wal' -ErrorAction SilentlyContinue
   Remove-Item 'C:\ProgramData\SchoolCBT\data\school.db-shm' -ErrorAction SilentlyContinue
   ```
5. **Start it and check:** `& 'C:\Program Files\SchoolCBT\SchoolCBT.exe' start`, then
   `curl http://localhost:8080/health`. The wizard should report the setup as complete because the
   school name, cloud URL and console PIN came with the backup. The device secret did not: it lives
   in `secrets\device.bin`, protected by DPAPI for the _old_ machine, so the spare PC is not yet
   activated.
6. **Activate the replacement.** Ask the Platform Owner for an activation code with _replace this
   device_ set, then enter it at `http://localhost:<port>/setup`. The cloud revokes the dead device.
7. **Refresh from the cloud.** The server pulls the roster and the packs again and uploads anything
   that was still in the outbox. Duplicates are harmless; the cloud keeps each event once.

**Cloud restore.** `PUT /sync/v1/backups/:name` (upload) and `GET /sync/v1/backups/latest`
(download) are specified in API spec 13.9 but are not implemented yet on either side, so a spare PC
with no backup on site cannot be recovered from the cloud today. Treat the second backup location as
the off-machine copy until that is built.

## 4. The server will not start (database corrupt or missing)

1. Look at `C:\ProgramData\SchoolCBT\logs\` and try `& 'C:\Program Files\SchoolCBT\SchoolCBT.exe'
start` again — a locked file from a previous crash usually clears.
2. If the log mentions corruption, rename rather than delete the database, so it can be inspected
   later:
   ```powershell
   Rename-Item 'C:\ProgramData\SchoolCBT\data\school.db' school.db.broken
   ```
3. Follow section 1 from step 3 with the newest `backups\school-*.db`, or section 3 from step 3 if
   the backup folders are gone too.

## 5. An update went wrong

Updates install themselves only between sittings and take a database copy first
(`backups\pre-update-<stamp>.db`).

1. The updater rolls back on its own if the server is not healthy within 60 seconds of starting. The
   result is in `data\updates\last-result.json` (`applied`, or `update_failed` with the reason) and
   in `logs\apply-update.log`.
2. If the server is still down, run
   `C:\ProgramData\SchoolCBT\data\updates\SchoolCBT-Update.cmd` as administrator, or re-run the
   installer from the `updates\` folder manually.
3. If the data looks wrong after an update, restore `backups\pre-update-<stamp>.db` using section 1 —
   migrations are forward-only, so the database has to come from a copy rather than being migrated
   down.

## 6. Verify before you let students in

- `curl http://localhost:<port>/health` answers, and its `backup` check is `ok` (not `degraded`).
- `curl http://localhost:<port>/health/details` reports `databaseIntegrity` as `ok`.
- The console Overview shows the expected number of students and the right school name.
- The next sitting appears with its exam key.
- `backups\` newest file is recent (the server backs up after each sitting and nightly at 22:00).
- Sign in on one lab PC and confirm the login screen accepts a student code.

## 7. When to escalate

Call the Platform Owner when: no backup from the last two days exists anywhere, the cloud reports the
device as revoked when it should not be, activation codes are refused, or the same failure happens
twice in a week. Send `logs\restore-backup.log`, `logs\apply-update.log`, the JSON result files and
the newest backup file names.
