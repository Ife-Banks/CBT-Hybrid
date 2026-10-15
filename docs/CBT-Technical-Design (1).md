# School CBT Platform: Technical Design

Version 1.0 · 11 October 2026 · Status: draft for review

This is the technical blueprint for the school CBT platform. It covers what we build, who uses it, which technology we use, how the offline lab system works, how it syncs with the online system, and what documents come next. Section 19 lists the remaining documents and the order to write them in.

The product has no name yet. In this document it is called "the platform".

---

## Contents

1. [What we are building](#1-what-we-are-building)
2. [Decisions log](#2-decisions-log)
3. [The apps we build](#3-the-apps-we-build)
4. [Roles and permissions](#4-roles-and-permissions)
5. [Technology stack](#5-technology-stack)
6. [Architecture](#6-architecture)
7. [Lab network and how PCs reach the server](#7-lab-network-and-how-pcs-reach-the-server)
8. [How the offline exam system works](#8-how-the-offline-exam-system-works)
9. [How offline and online sync](#9-how-offline-and-online-sync)
10. [Data model](#10-data-model)
11. [Student codes and exam keys](#11-student-codes-and-exam-keys)
12. [Question import from Word and Excel](#12-question-import-from-word-and-excel)
13. [Security and privacy](#13-security-and-privacy)
14. [Installer, updates, backup and support](#14-installer-updates-backup-and-support)
15. [Non-functional requirements](#15-non-functional-requirements)
16. [Testing strategy](#16-testing-strategy)
17. [Environments and delivery pipeline](#17-environments-and-delivery-pipeline)
18. [Risks and open questions](#18-risks-and-open-questions)
19. [Documents still to write](#19-documents-still-to-write)
20. [Glossary](#20-glossary)

---

## 1. What we are building

A computer-based testing (CBT) platform for a school. Students write exams in the school's computer lab with no internet needed. Teachers prepare exams and mark results in the cloud. Parents see released results online.

Two halves, one codebase:

| Half | Where it runs | Needs internet? | Who uses it |
|---|---|---|---|
| **Cloud (control plane)** | A hosted Linux server | Yes | Admin, Teachers, Parents |
| **School exam server** | One dedicated PC in the school lab | No (only to sync) | Students, Invigilators |

The cloud owns setup, questions and parents. The exam server owns live exam sessions, answers and raw scores. Because each side owns different data, the two never fight over the same record.

```
        TEACHERS / ADMIN / PARENTS (any device, any place)
                        │  HTTPS
                        ▼
┌─────────────────────────────────────────────┐
│ CLOUD                                       │
│  Next.js portals  ◄──►  NestJS API          │
│                          │                  │
│                    PostgreSQL · Redis       │
│                    S3-compatible storage    │
└──────────────▲──────────────────────────────┘
               │ HTTPS, outbound from school only
               │  ▼ exam packs + roster   ▲ results
┌──────────────┴──────────────────────────────┐
│ SCHOOL LAB (works with no internet)         │
│  Exam server PC (Windows service)           │
│   NestJS · SQLite · static exam client      │
│        ▲  plain HTTP over the lab LAN       │
│  Lab PCs: browser only, nothing installed   │
└─────────────────────────────────────────────┘
```

---

## 2. Decisions log

| # | Decision | Status |
|---|---|---|
| D1 | Admin and Teacher portals live in the cloud | Decided |
| D2 | Students write exams offline in the lab against a local exam server | Decided |
| D3 | Parent Portal is the only part that must be online | Decided |
| D4 | Teachers can import questions from Word and Excel | Decided |
| D5 | All apps are web apps. Only the exam server PC has an installed program | Decided |
| D6 | SQLite on the school exam server, PostgreSQL in the cloud | Decided |
| D7 | One school-owned lab PC acts as the exam server, preferably dedicated and on a UPS | Decided (hardware to be confirmed on a site visit) |
| D8 | TypeScript across the whole codebase | Proposed |
| D9 | Windows native installer for the exam server, not Docker | Proposed (confirm the PC runs Windows) |
| D10 | School fees are Phase 2 and live in the cloud | Proposed |
| D11 | Cloud never connects into the school. The school server calls out | Proposed |

---

## 3. The apps we build

You build **five deliverables** from one repository.

| # | App | Type | Runs on | Users |
|---|---|---|---|---|
| 1 | **Cloud Web** (Admin, Teacher, Parent portals) | Web app (Next.js) | Cloud server | Admin, Teachers, Parents |
| 2 | **Cloud API** | Backend service (NestJS) | Cloud server | Cloud Web and the school server |
| 3 | **Exam Client** | Web app (React, static files) | Served by the school server, opened in a browser on lab PCs | Students |
| 4 | **School Exam Server** (includes the Invigilator Console) | Backend service (NestJS) plus a console web page, as a Windows service | The lab server PC | Invigilators, plus all lab PCs call it |
| 5 | **Windows Installer** | `.exe` setup program | The lab server PC, once | The person setting it up |

### What users do and do not install

- Students, teachers, admins and parents install **nothing**. They open a browser.
- Only the server PC runs the installer (`SchoolCBT-Setup.exe`). It installs the exam server as a background Windows service that starts when the PC boots.

### Why not an `.exe` on every PC

Installing and updating 30 or more machines is slow, versions drift apart, and a mistake on one PC can break an exam. A web page served from one machine avoids all of that.

### Two experiences in the Exam Client

The class level decides which screen loads. Both use the same engine.

| | Primary | Secondary |
|---|---|---|
| Layout | One question per screen, large buttons | Question navigator, flag for review |
| Options | Fewer per question | Full set |
| Media | Images, optional read-aloud | Images, maths via KaTeX |
| Timer | Gentle, always visible | Countdown with warnings |

### Monorepo layout

```
/apps
  cloud-web        Next.js: admin, teacher, parent
  cloud-api        NestJS: cloud backend
  exam-client      React (Vite): student exam, built as static files
  school-server    NestJS: exam server + invigilator console
  installer        Inno Setup scripts, service wrapper config
/packages
  exam-core        marking logic, pack format, shuffling (shared by cloud and school)
  shared-types     Zod schemas and TypeScript types for every API
  ui               shared components and design tokens
  config           ESLint, TypeScript, Tailwind presets
/docs              this document and all others in section 19
```

`exam-core` is shared on purpose. Marking written once means the lab and the cloud always give the same score.

---

## 4. Roles and permissions

### 4.1 Roles

| Role | Who | Where they log in | How they log in |
|---|---|---|---|
| **Platform Owner** | You | Cloud | Email, password, authenticator app (required) |
| **School Admin** | Principal, ICT or exams officer | Cloud | Email, password, authenticator app (recommended) |
| **Teacher** | Subject or class teacher | Cloud | Email, password |
| **Class Teacher** | A teacher with an extra flag for one class | Cloud | Same as Teacher |
| **Invigilator** | Teacher or ICT staff running a sitting | School server console | Console PIN |
| **Parent** | Parent or guardian | Cloud | Phone or email, one-time code |
| **Student** | Pupil | School exam client only | Student code plus exam key |
| **Bursar** (Phase 2) | Fees officer | Cloud | Email, password |

A Class Teacher is not a separate account type. It is an assignment flag on a teacher for a class. It lets that teacher approve result release for that class if the school allows it.

### 4.2 Permission matrix

C = create, R = read, U = update, D = delete, A = approve or release, Own = only their own records, Assigned = only classes and subjects assigned to them, Linked = only linked children.

| Resource | Platform Owner | School Admin | Teacher | Invigilator | Parent | Student |
|---|---|---|---|---|---|---|
| Schools and licences | CRUD | R (own) | – | – | – | – |
| Terms, levels, classes, subjects | CRUD | CRUD | R (assigned) | – | – | – |
| Teachers and assignments | CRUD | CRUD | R (self) | – | – | – |
| Students and codes | CRUD | CRUD | R (assigned) | R (roster, local) | R (Linked) | – |
| Parents and links | CRUD | CRUD | – | – | R, U (self) | – |
| Question bank | R | R | CRUD (Assigned, Own for edit) | – | – | – |
| Question import | – | C | C (Assigned) | – | – | – |
| Exams and schedules | R | CRUD | CRUD (Assigned) | R (local) | – | – |
| Exam pack publishing | R | A | A (Assigned, if allowed) | – | – | – |
| Open and close a sitting | – | – | – | A | – | – |
| Seat assignment, extra time, session reset | – | – | – | A | – | – |
| Take an exam | – | – | – | – | – | C (own sitting) |
| Raw scores and answers | R | R | R (Assigned) | R (progress only) | – | – |
| Re-mark after key correction | – | A | A (Assigned) | – | – | – |
| Release results to parents | – | A | A (Class Teacher, if allowed) | – | – | – |
| View released results | – | R | R (Assigned) | – | R (Linked) | – |
| Sync status and health | R | R | – | R (local) | – | – |
| Audit log | R | R | – | – | – | – |
| Fees and receipts (Phase 2) | R | R | – | – | R (Linked), pay | – |

### 4.3 How access is enforced

- Every request carries a user, a role and a `school_id`.
- Role checks sit in NestJS guards using CASL abilities, in one central place. No controller makes its own decision.
- Every database query is scoped by `school_id`, and then by the role's scope: assigned classes for Teachers, guardianship links for Parents.
- Hiding a button in the UI is never the protection. The backend must refuse the call.
- An automated test walks the matrix above. Every role calls every protected endpoint and the test asserts allow or deny. This is the most important test suite in the project.

### 4.4 Parent and student rules

- A parent account links to one or more students through a **guardianship** record. One parent login, many children, with a child switcher.
- Parent accounts are created by the school and sent an invite. A parent can never self-register.
- A student has no login to any portal. The student code works only against the exam server, and only while a sitting is open.

### 4.5 How teacher and parent accounts are created

The school creates every account. Nobody signs up on their own. The system sends an invitation and the person activates their own account, so the school never sees or sets a password. The full flows, edge cases and rules are in `CBT-01-Product-Requirements.md` section 5. The summary:

| Account | Created by | Signs in with | How they get in |
|---|---|---|---|
| School Admin (first) | Platform Owner, when creating the school | Email and password, plus authenticator app | Email invite link, set password, set up the authenticator app |
| School Admin (more) | An existing School Admin | Email and password | Email invite link |
| Teacher | School Admin, one at a time or by CSV | Email and password | Email invite link valid 7 days, set password |
| Parent | School Admin registers a guardian and links children, one at a time or by CSV | Phone or email and password | Invite by SMS, WhatsApp, email or printed slip, valid 14 days. The parent requests a 6-digit code sent to the phone or email the school registered, then sets a password |
| Student | School Admin, one at a time or by CSV | No login. A student code at the exam | Printed code slip |
| Invigilator | Set when the exam server is activated | Console PIN on the lab server | None |

How the parent flow works in practice:

1. The admin imports guardians with the admission numbers of their children. Rows with the same phone number become one guardian linked to several children, so one parent has one login for all of them.
2. The system creates an invitation (single use, stored hashed) and sends a link by the chosen channel. A link copied and sent by hand is allowed but still needs the one-time code, so a forwarded link alone cannot activate the account.
3. The parent opens the link, asks for a code, receives it on the registered phone or email, enters it and sets a password. After that they sign in with phone or email and password. One-time codes are used only to activate, reset a password or verify a changed contact, which keeps SMS costs low.
4. Two parents of the same child each have their own account. Either can be restricted from seeing a child's results (for example after a custody dispute).

Teachers follow the same pattern with an email invite and no one-time code, unless the invite link was copied and sent by hand. Tables: `users`, `guardians`, `guardianships`, `invitations`, `otp_challenges` (`CBT-02-Data-Model.md`). Endpoints: `CBT-03-API-and-Sync-Specification.md` sections 4 and 5.

---

## 5. Technology stack

All versions should be the current long-term-support release when the build starts. Pin them in the lockfile.

| Layer | Choice | Where | Why |
|---|---|---|---|
| Language | TypeScript | Everywhere | One language, shared types between cloud and school server |
| Runtime | Node.js (current LTS) | Cloud and school server | Same code on both sides |
| Monorepo | pnpm workspaces and Turborepo | Repo | Shared packages, fast builds |
| Cloud backend | NestJS | Cloud API | Guards, modules and DI suit role-based access. Your existing stack |
| School backend | NestJS (same modules) | Exam server | Reuses marking, auth and pack code |
| Cloud database | PostgreSQL | Cloud | Relational data, strong constraints, your existing stack |
| School database | SQLite (WAL mode) via `better-sqlite3` | Exam server | No database service to crash on an unmanaged PC. Backup is a file copy |
| ORM and migrations | Drizzle ORM and drizzle-kit | Both | Supports Postgres and SQLite with typed queries |
| Cache and jobs | Redis and BullMQ | Cloud only | Emails, import parsing, notifications. Not used on Windows |
| Scheduler on school server | In-process scheduler and an outbox table | Exam server | No extra service to install |
| Cloud frontend | Next.js (App Router) and React | Cloud Web | Your existing stack |
| Exam client | React with Vite, built to static files | School server serves it | Small, no server rendering needed, works on old PCs |
| Styling | Tailwind CSS and Radix primitives | All web apps | Shared design tokens in `packages/ui` |
| Data fetching | TanStack Query | Frontends | Retry and cache control |
| Validation | Zod | All, in `shared-types` | One schema validates client and server |
| Live updates | WebSockets (NestJS gateway) | Invigilator console | Live progress during a sitting |
| Maths display | KaTeX, bundled locally | Exam client, cloud | No CDN dependency |
| Spreadsheet import | ExcelJS | Cloud | Reads `.xlsx` and `.csv` |
| Word import | `mammoth` (docx to HTML) and a parser | Cloud | Extracts text, options, images |
| Passwords | argon2id | Cloud | Current best practice |
| Sessions | HttpOnly cookies, server-side sessions | Cloud | Simple and revocable |
| Email | A transactional email provider behind an adapter | Cloud | Swap providers without code changes |
| SMS or WhatsApp | Provider adapter, off by default | Cloud | Billed per message |
| Files | S3-compatible object storage | Cloud | Question images, backups |
| Cloud hosting | Linux VPS, Docker Compose, Caddy for TLS | Cloud | Cheap, simple |
| School packaging | Node runtime and app folder, installed as a Windows service with WinSW, built into one installer with Inno Setup | School PC | Native and reliable on Windows |
| Logging | pino, rotating files on school server, Sentry in cloud | Both | Find faults after the fact |
| Testing | Vitest or Jest, Playwright, k6 | Repo | See section 16 |
| CI and CD | GitHub Actions, with a Windows runner for the installer | Repo | Reproducible installers |

### Why SQLite on the school server

- 60 students saving answers every few seconds is a handful of writes a second. SQLite in WAL mode handles that comfortably, and the exam server is the only process writing to it.
- No database service means no password, no port clash, and nothing that stops while the exam runs.
- The local database is not a copy of the cloud database. It holds only what an exam needs, so the two schemas do not have to match.
- Use `synchronous=FULL` so a committed answer survives a power cut. Turn on `foreign_keys` and set a `busy_timeout`.
- Switch to PostgreSQL only if one school ever needs several exam servers at once.

---

## 6. Architecture

### 6.1 Cloud

```
Internet
   │
  Caddy (TLS, reverse proxy)
   ├── cloud-web    (Next.js)
   └── cloud-api    (NestJS)
          ├── PostgreSQL
          ├── Redis  ── BullMQ workers (email, import, notifications, re-mark)
          └── Object storage (images, packs, backups)
```

Modules in `cloud-api`: Auth, Users and Roles, Schools, Academic structure, Students and Guardians, Question Bank, Import, Exams and Packs, Results and Release, Notifications, Sync, Audit, Fees (Phase 2).

### 6.2 School exam server

```
Windows service: SchoolCBT
   ├── HTTP server (port 8080)
   │     ├── /            static exam client
   │     ├── /api/...     exam API for students
   │     ├── /console     invigilator console (PIN)
   │     └── /ws          WebSocket for live progress
   ├── SQLite file  (C:\ProgramData\SchoolCBT\data\school.db)
   ├── Packs folder (C:\ProgramData\SchoolCBT\packs)
   ├── Sync agent   (outbox sender, pack puller, heartbeat)
   ├── Backup job   (nightly and after each sitting)
   └── Logs         (rotating files)
```

Modules in `school-server`: Roster, Packs, Sittings, Sessions, Answers, Marking, Console, Outbox and Sync agent, Backup, Health.

### 6.3 Where each kind of data lives

| Data | Owner | Copies elsewhere |
|---|---|---|
| Schools, terms, classes, subjects, teachers | Cloud | Roster slice sent to the school server |
| Students and student codes | Cloud | Sent to the school server |
| Parents and guardianship links | Cloud | Never sent to the school server |
| Question banks and answer keys | Cloud | Only the exam pack for a scheduled exam goes to the school |
| Exams, schedules | Cloud | Sent to the school server inside the pack |
| Sittings, sessions, answers, raw scores | School server | Copied up to the cloud after the sitting |
| Result review and release state | Cloud | Never goes down |
| Fees (Phase 2) | Cloud | Read-only view later, if needed |

This split is what keeps sync free of conflicts. Setup and content flow down. Results flow up. No record has two writers.

---

## 7. Lab network and how PCs reach the server

The school has no real server. The lab PCs are networked together and one acts as the shared machine. The platform uses that PC as the exam server.

```
Lab PC browser ─► http://192.168.1.10:8080 ─► Exam server service ─► SQLite
```

### Setup steps (done once by the installer and a person)

1. **Fixed IP.** Give the server PC a fixed address, either by setting it on the PC or by reserving it in the router. Without this, the exam link breaks when the address changes.
2. **Port.** The service listens on port 8080 by default. The port is configurable if it clashes with other software.
3. **Firewall.** The installer adds an inbound Windows Firewall rule for that port on the private network profile.
4. **No sleep.** The installer disables sleep and hibernate on the server PC and sets it to start the service on boot.
5. **Shortcuts on lab PCs.** Copy a desktop shortcut to each lab PC. The school already copies files across the network, so this is easy. The shortcut opens Chrome or Edge in kiosk mode: `chrome.exe --kiosk http://192.168.1.10:8080/?seat=PC-12`. The `seat` value is optional and names the PC for the seat map.
6. **QR code.** The sitting screen on the console shows a link and a QR code, for phones, tablets or a PC without the shortcut.
7. **Internet for sync.** The exam LAN needs no internet. The server PC needs a way out only when it syncs, for example a router connection, a second network card, or a phone hotspot.

### Notes

- Plain HTTP is fine on an isolated lab network. The exam client does not use any feature that requires HTTPS.
- The invigilator console is reachable at `/console` on the server PC itself, and from a named invigilator device if the school allows it. It asks for the console PIN.
- The server clock is the only clock that counts. The console shows the clock and warns if it looks wrong. Clock drift also makes sync signatures fail, so the sync agent checks it.
- The server PC should not be used by students or teachers during or between exams.

---

## 8. How the offline exam system works

### 8.1 Exam lifecycle

| Stage | Where | What happens |
|---|---|---|
| Draft | Cloud | Teacher builds the exam from the question bank or an import |
| Scheduled | Cloud | Admin sets date, window and lab seats |
| Frozen | Cloud | 24 hours before the start the exam locks. A later edit creates a new pack version |
| Pack published | Cloud | A signed pack is built and made available |
| Pack loaded | School | Server pulls the pack. Console shows version and checksum |
| Sitting open | School | Invigilator opens the sitting. A fresh exam key is generated |
| In progress | School | Students log in and answer |
| Closed | School | Window ends or invigilator closes the sitting. Open sessions are submitted |
| Marked | School | Objective questions scored on the server |
| Synced | Both | Results copied to the cloud |
| Reviewed | Cloud | Teacher reviews, can re-mark after a key correction |
| Released | Cloud | Admin or Class Teacher releases. Parents are notified |

### 8.2 Exam day, step by step

1. A few days before, the server pulls the pack. The console shows **Pack loaded, version N, checksum OK**. If it does not, there is time to fix it.
2. The invigilator opens the console, picks the sitting and opens it. The server generates a **6-digit exam key** and shows it on screen.
3. Students sit at lab PCs and open the exam page. They enter their **student code** and the **exam key**.
4. The server checks the code against the roster, checks the student is in the class for this exam, and creates a session bound to the seat.
5. The client downloads the question set for that student. Questions and options are shuffled with a seed stored in the session, so a resume shows the same order.
6. The student answers. The client saves every change.
7. At the deadline or on submit the server marks the objective questions and queues the result for sync.
8. When the school has internet the sync agent sends results to the cloud.

### 8.3 Autosave and resume

- The client holds answers in memory and in the browser's IndexedDB, with localStorage as a fallback.
- Each change is sent in a small batch: `PUT /api/sessions/:id/answers` with a sequence number. Changes are sent within a few seconds.
- The server stores the answers only if the sequence number is newer than what it has. It replies with the acknowledged sequence number, the server time and the milliseconds remaining.
- If a request fails, the client keeps working and retries with backoff. The screen shows "Saved" or "Connection lost. Your answers are kept on this PC".
- If the PC dies, the student logs in again with the same code and key. The server finds the active session, returns the saved answers and the remaining time.
- If the server restarts, committed answers are on disk because of `synchronous=FULL`. At most the last few seconds of answers are at risk, and the browser buffer covers those.

### 8.4 Timer

- The server sets `ends_at = min(start + duration + extra time, window close)` when a session starts.
- The client shows a countdown and re-syncs it on every acknowledgement.
- At zero the client submits. The server also expires sessions on its own, so a dead PC does not leave a session open forever. An expired session is submitted with the last saved answers.

### 8.5 Invigilator console

- See live progress per seat: not started, in progress, submitted, last saved.
- Open and close a sitting, show the exam key, assign seats.
- Grant extra time to one student or a seat, with a reason.
- Reset a stuck session, with a reason, keeping answers or discarding them.
- See pack version, sync status, last backup, disk space and clock.
- Every action is written to the audit log.

### 8.6 Integrity measures

- Student code plus exam key plus seat. One active session per student.
- Questions and options shuffled per student with a stored seed.
- Answer keys stay on the server and are never sent to a browser.
- Lab network has no internet during a sitting.
- Rate limit on code attempts. Five failures lock that seat for a minute and alert the console.
- Optional soft signals: focus loss and window switch counts recorded in the session log. They are shown to the teacher, not used to fail a student.

---

## 9. How offline and online sync

### 9.1 Principles

1. **The school calls the cloud. The cloud never calls the school.** School networks sit behind NAT with no public address, so no port forwarding is needed.
2. **One writer per record.** Setup and content are written in the cloud. Sessions and scores are written at the school.
3. **Everything is retryable.** Every event has a unique ID. Sending it twice has the same effect as once.
4. **The exam never waits for sync.** Sync can run late, fail, or be skipped for weeks without touching an exam.

### 9.2 What moves in each direction

**Down (cloud to school):**

- Roster slice: levels, classes, subjects, teacher names for display, students and their codes.
- Exam packs for scheduled exams.
- Settings the school server needs (school name, exam rules, console PIN reset).

**Up (school to cloud):**

- Final answers per session, and the raw score per session.
- Session logs: start, end, extra time, resets, integrity signals.
- Heartbeat: software version, packs held, last backup time, free disk, clock offset.

Parents, fees and review state never go down.

### 9.3 Sync API (cloud side)

| Endpoint | Purpose |
|---|---|
| `POST /sync/v1/activate` | Registers a school server with a one-time activation code. Returns a key ID, a secret and the cloud's public signing key |
| `GET /sync/v1/changes?since=<cursor>` | Returns roster and schedule changes since the cursor |
| `GET /sync/v1/packs/:packId/:version` | Downloads a pack. Resumable. Returns a hash |
| `POST /sync/v1/results` | Accepts a batch of outbox events with idempotency keys |
| `POST /sync/v1/heartbeat` | Receives status. Feeds the cloud's sync health screen |

### 9.4 Request security

- Each request is signed with HMAC: key ID, timestamp, body hash. The cloud rejects requests outside a five-minute window and rejects reused signatures.
- Packs are signed by the cloud with an Ed25519 key. The school server holds the public key and refuses an unsigned or altered pack.
- Pack contents are encrypted at rest on the school PC. Answer keys sit in a separate encrypted section so someone browsing the folder cannot read them.
- If the school clock is wrong, signatures fail. The agent detects this from the cloud's response and shows "Check the PC clock" in the console.

### 9.5 The outbox

Every event that must reach the cloud is written to an `outbox` table in the same database transaction that created it. A score and its outbox row are saved together or not at all.

```
outbox(id, type, payload, created_at, sent_at, attempts, last_error)
```

The sync agent:

1. Checks for internet.
2. Sends unsent rows in order, in compressed batches.
3. Marks rows sent only after the cloud acknowledges them.
4. On failure, waits and retries with exponential backoff.
5. Never deletes unsent rows.

### 9.6 Event types

`session.started`, `session.submitted`, `session.scored`, `session.reset`, `sitting.closed`.

Autosave updates are not sent. Only the final answers and the score are.

### 9.7 Pack format

A pack is a compressed bundle:

```
pack.json        pack id, exam id, version, school id, subject, class, duration,
                 window, settings (shuffle, marks), question list, asset manifest
keys.enc         answer keys and marking rules, encrypted
assets/          images and media, each with a hash
signature        cloud signature over the manifest
```

The server verifies the signature and each asset hash before marking the pack as loaded.

### 9.8 Re-marking after a key correction

Teachers sometimes find a wrong answer key after the exam. The cloud keeps the pack keys and the submitted answers, so it can re-mark with the same `exam-core` code. The school does not need to be involved. Each result records which pack version and key version produced it.

### 9.9 Results review and release

Local scores arrive as drafts. The cloud then runs the review flow: **draft, reviewed, released**. Only released results appear in the Parent Portal. Release triggers a notification to linked parents.

### 9.10 Failure cases

| Situation | What happens |
|---|---|
| No internet for days | Exams continue. Outbox grows. Parents see older data. Admin dashboard shows "last synced" |
| Internet drops mid-upload | Batch is retried. Idempotency keys stop duplicates |
| Pack not loaded before exam day | Console shows a red readiness check. Cloud alerts the admin 48 hours before |
| Exam edited after the freeze | A new pack version. Sessions in progress finish on the version they started with |
| School clock wrong | Sync refuses and shows a clock warning |
| Server PC dies | Install on a spare lab PC, activate, pull roster and packs. Restore the latest backup for in-progress or unsynced results |
| Cloud down | Exams unaffected. Sync waits |
| School has no internet at all | Export results to a file on a USB drive. Import it in the cloud portal |

### 9.11 USB fallback

The console can export unsent outbox events as a signed file. A School Admin or the Platform Owner uploads it in the cloud portal and it is processed like a normal sync. Packs can be downloaded from the cloud to a USB drive and imported on the server in the same way.

---

## 10. Data model

An overview, not the full schema. The Data Model document in section 19 expands it.

### 10.1 Cloud (PostgreSQL)

| Group | Entities |
|---|---|
| Tenancy | School, Licence, SyncDevice |
| People | User, TeacherProfile, Student, Guardian, Guardianship |
| Structure | AcademicYear, Term, Level, Class, Subject, ClassSubject (teacher assignment) |
| Questions | Question, Option, QuestionAsset, ImportJob, ImportRow |
| Exams | Exam, ExamQuestion, ExamPack, Sitting |
| Results | Submission, SubmissionAnswer, Result, ResultReview, Release |
| Comms | Notification, NotificationDelivery |
| Platform | AuditLog, SyncEvent |
| Fees (Phase 2) | FeeItem, Invoice, Payment, Receipt |

Every table carries `school_id`, `created_at`, `updated_at`, and a soft-delete flag where deletion matters.

### 10.2 School exam server (SQLite)

| Table | Holds |
|---|---|
| `meta` | School ID, key material, settings, cloud public key, console PIN hash |
| `students`, `classes`, `subjects` | Roster slice from the cloud |
| `exams`, `packs` | Exam records and pack file references with hashes |
| `sittings` | One run of an exam in the lab: state, key hash, window, seats |
| `sessions` | One student in one sitting: state, seed, ends_at, extra time, seat |
| `answers` | session, question, value, sequence number, updated time |
| `results` | Score per session, pack version, key version |
| `outbox` | Events waiting to be sent |
| `sync_cursor` | Last change cursor pulled from the cloud |
| `audit_log` | Console and system actions |
| `backup_log` | Backups taken, with checksums |

### 10.3 Question types in the MVP

Single choice, multiple choice, true or false, fill-in-the-blank with accepted answers. Theory questions come later with manual marking.

---

## 11. Student codes and exam keys

### 11.1 Student code

The code is an **identifier that looks up the student**, not a container of their details. The details sit in the roster. If a student changes class, the code stays the same.

- Format: `SCHOOLCODE-XXXXXXXXC`, for example `ABC-7K2M9QXDG`.
- Alphabet: `23456789ABCDEFGHJKMNPQRSTUVWXYZ`. No `0`, `1`, `I`, `L` or `O`, so nothing is misread.
- Eight random characters plus one check character, so a mistyped code is rejected before any lookup. The check character is a weighted mod-31 checksum (defined in `CBT-04-Build-Specification.md`). It catches every single-character typo and every swap of two neighbouring characters.
- Codes are generated in the cloud, are unique per school and are never reused.
- Codes are printed on slips or a class sheet and handed out by the school. A student who loses a code gets a reissue, and the old one is revoked.

### 11.2 Exam key

- Six digits, generated on the exam server when the invigilator opens a sitting.
- Shown only on the console. Changes every sitting.
- A student needs both the code and the key. This stops someone using a friend's code from home or from outside the room.

### 11.3 Seats

A seat is a lab PC. It is named by the `seat` parameter in the shortcut, or assigned in the console. A session is tied to its seat, so a student cannot start a second session from another PC while the first is active.

---

## 12. Question import from Word and Excel

Teachers prepare questions at home, upload a file in the Teacher portal, check a preview and confirm.

### 12.1 Formats

| Format | Layout |
|---|---|
| **Excel or CSV** | Template with columns: subject, class level, topic, question type, question text, options A to E, correct answer, marks, difficulty, explanation, image name |
| **Word (.docx)** | Template with numbered questions, options A to D on separate lines, an `Answer: B` line, optional `Marks:` line |

Free-form Word files do not parse reliably. The templates are the supported format. Macro-enabled files (`.docm`) are rejected.

### 12.2 Flow

1. Teacher downloads the template and fills it in.
2. Teacher uploads the file. A background job in the cloud parses it.
3. The portal shows a preview table of every detected question.
4. Problems are flagged: missing answer, correct answer matching no option, duplicate options, likely duplicate of an existing question, unsupported type.
5. The teacher fixes issues inline and confirms.
6. Questions enter the bank as **drafts**. They are never put straight into an exam.

### 12.3 Rules

- Images embedded in Word are extracted and attached. For Excel the images arrive in a zip with the sheet.
- Maths is written as LaTeX-style text, such as `$x^2 + 3x$`, and rendered with KaTeX. Word equations do not convert reliably, and the template says so.
- Limits: a file size cap and about 200 questions per file.
- Parsing runs in the cloud only, never on the school server.
- Later option: AI-assisted cleanup of messy Word files. It always ends in the human preview.

---

## 13. Security and privacy

### 13.1 Controls

| Area | Control |
|---|---|
| Passwords | argon2id. Authenticator app required for Platform Owner, recommended for School Admin |
| Sessions | HttpOnly, Secure cookies. Server-side sessions that can be revoked |
| Transport | TLS everywhere in the cloud. Plain HTTP on the isolated lab LAN |
| Access | Central role checks, `school_id` scoping, automated permission matrix test |
| Exam content | Keys never sent to browsers. Packs signed and encrypted at rest |
| Student entry | Code plus exam key plus seat, with rate limits |
| Uploads | Type and size checks, no macros, parsed in an isolated job |
| Audit | Admin, console and release actions are logged and cannot be edited |
| Secrets | Per-school sync keys, rotatable from the cloud |
| Backups | Encrypted, tested restores |
| Windows PC | Dedicated, locked-down account, USB and install restrictions, disk encryption recommended |

### 13.2 Children's data

The platform stores names, classes and scores of minors. The Nigeria Data Protection Act 2023 applies. Plan for:

- A privacy notice and parental consent captured when the school registers a student.
- Data minimisation. The school server holds only what an exam needs. Parent details never go to it.
- A retention rule for old exams and results.
- A breach response procedure. The Act sets a short deadline to notify the regulator, so write the procedure before launch.
- Cross-border transfer. If the cloud is hosted outside Nigeria, confirm the safeguards.

Take legal advice on the contract, privacy notice and consent wording. This document is not legal advice.

---

## 14. Installer, updates, backup and support

### 14.1 What the installer does

1. Copies the Node runtime and the app into `C:\Program Files\SchoolCBT`.
2. Creates the data folder `C:\ProgramData\SchoolCBT` for the database, packs, logs and backups.
3. Registers the Windows service with automatic start and restart on failure.
4. Adds the firewall rule and disables sleep.
5. Creates the nightly backup task.
6. Opens the setup page, where the person enters the **activation code** from the cloud and sets the console PIN.
7. The first sync pulls the roster and any scheduled packs.

An unsigned `.exe` triggers Windows SmartScreen and sometimes antivirus warnings. Plan on a code-signing certificate, which is a recurring cost.

### 14.2 Updates

- Versioned releases. Update by running the new installer, or from an in-app update when online.
- A backup is taken before every update.
- Database migrations run on start. If a migration fails the old version is restored.
- Updates are applied only between exam windows. The console blocks an update while a sitting is open.

### 14.3 Backup and restore

- Nightly and after every sitting, using the SQLite backup API, copied to an external drive and a second folder.
- Backup files are checksummed and the last 30 are kept.
- When online, an encrypted copy of the latest backup is uploaded to the cloud.
- Restore procedure: install on a spare PC, activate, choose restore from backup or from the cloud, check pack and roster versions.
- Cloud: daily database dumps to object storage, 30 day retention, a restore tested monthly.

### 14.4 Remote support

Ask the school to allow remote access through a VPN such as Tailscale or WireGuard, or through a remote-support tool they trust. Without remote access, every fix is a visit.

### 14.5 Monitoring

- The school server sends a heartbeat to the cloud: version, packs held, disk space, last backup, clock offset.
- The Platform Owner dashboard shows every school's last heartbeat and flags problems: no heartbeat for days, low disk, backup failing, clock off.
- The console shows the same information locally.

---

## 15. Non-functional requirements

| Area | Target |
|---|---|
| Lab size | Comfortable up to 60 concurrent students. Designed and tested for 150 |
| Autosave latency | Under 200 ms on the lab network |
| Submit and mark | Under 2 seconds per student |
| Sync size | A day of results for 500 students uploads in minutes on a slow connection, because only final answers and scores are sent |
| Data loss on server failure | Last few seconds of answers at most, covered by the browser buffer |
| Replace a dead server | Under one hour with the installer, a spare PC and a backup |
| Offline period | The school can run a full term without internet |
| Browsers | Chrome or Edge. Build target set to the oldest version the lab runs, confirmed in the site survey. Default is a version from the last few years |
| Offline assets | Every font, icon, script and the maths renderer is bundled. No CDN calls in the exam client |
| Accessibility | Keyboard navigation, readable font sizes, adjustable text size in the exam client |
| Languages | English first. Text kept in translation files for later |
| Time | Server clock is the authority. Clock check in the console |

---

## 16. Testing strategy

| Test | What it proves |
|---|---|
| **Permission matrix tests** | Every role against every protected endpoint. Allow or deny as in section 4 |
| **Unit tests on `exam-core`** | Marking, shuffling, pack signing and verification |
| **Import tests** | Sample Word and Excel files with good rows and bad rows |
| **End-to-end (Playwright)** | Teacher builds an exam, pack publishes, student takes it, results reach the Parent Portal |
| **Load test (k6)** | 60 and 150 simulated students against a real exam server on a real LAN |
| **Fault tests** | Kill the server mid-exam. Pull the network cable. Sleep a lab PC. Fill the disk. Wrong clock |
| **Sync tests** | Duplicate sends, partial uploads, long offline period, large backlog |
| **Long-run test** | A three-hour exam with the screen locked on several PCs |
| **Installer tests** | Clean Windows install, upgrade, rollback, uninstall |
| **Pilot** | One class on a mock exam before the real term |

---

## 17. Environments and delivery pipeline

| Environment | Use |
|---|---|
| Local | Developer machine. Cloud in Docker, school server run directly |
| Staging | Cloud staging site plus a test Windows PC acting as an exam server |
| Production | Live cloud and the school's exam server PC |

Pipeline (GitHub Actions):

1. On every push: lint, type check, unit tests, build.
2. On merge: deploy cloud to staging with Docker, run end-to-end tests.
3. On release tag: deploy cloud to production. On a Windows runner, build and sign the installer and attach it to the release.

Database migrations are versioned for both Postgres and SQLite and tested both forward and with a restore.

---

## 18. Risks and open questions

### 18.1 Risks

| Risk | Response |
|---|---|
| Exam server is an ordinary lab PC | Dedicate one PC, fixed IP, firewall rule, no sleep, UPS, locked-down account, nightly backup, spare PC with the installer |
| Pack not loaded before exam day | Automatic pull, readiness check, 24 hour freeze, alert at 48 hours |
| Parents see stale results | Automatic sync, "last synced" and "last updated" labels, manual Sync now |
| Updates cannot be pushed remotely | Remote access agreement, versioned installer, update only between exams |
| Nobody on site knows what to do | One named server contact, a one-page runbook |
| Messy question files | Templates, preview with flags, drafts only |
| Scope creep from "better than J-Card" | Module list in the contract, change requests for additions |
| One developer | Documentation, deploy scripts and tests kept current |
| Unsigned installer warnings | Code-signing certificate |

### 18.2 Open questions

1. Which lab PC will be the exam server? Windows version, CPU, RAM, free disk, and can it be dedicated to the job?
2. Does the router hand out fixed or changing addresses, and can a reservation be set?
3. What Windows and Chrome or Edge versions do the lab PCs run?
4. How many PCs are in the lab and how many students sit at once?
5. Is there a UPS or generator in the lab?
6. Who at the school looks after the PC and network? Will they allow remote access?
7. Do teachers already have question banks in Word or Excel, and how are they laid out? Collect samples.
8. How many students does the school have, and what was said about pricing in the first voice note?
9. Is school-fee payment in the first release?
10. Will you keep the IP and license the product, or must the school own the code?
11. Should theory questions with manual marking be in the first release?
12. What was the content of the 12 second voice note?

---

## 19. Documents to write

Listed in the order I suggest writing them. Documents 1 to 5 are enough to start building.

| # | Document | Purpose | Needs input from | Priority |
|---|---|---|---|---|
| 1 | **Product Requirements (PRD) with user stories** | What each role can do, written as stories with acceptance criteria. The source of truth for scope | You, the school | Now |
| 2 | **Data Model and ERD** | Full tables, fields, keys, indexes and migrations for cloud and school server | PRD | Now |
| 3 | **API and Sync Specification** | Every endpoint with request and response shapes, errors, auth, plus the full sync protocol and pack format | Data model | Now |
| 4 | **Build specification for the coding agent** | Module by module prompts and acceptance tests: repo scaffold, auth and RBAC, import, exam builder, exam server, sync, parent portal, installer | Documents 1 to 3 | Now |
| 5 | **Site survey checklist** | A form to fill at the school: lab PCs, Windows and browser versions, network, router, UPS, server PC candidate, remote access | You | Now, before quoting |
| 6 | **UX brief, wireframes and design system** | Screens for each role, primary and secondary exam client, tokens and components. For the UI designer | PRD | Next |
| 7 | **Security and data protection pack** | Threat model, data protection impact assessment, privacy notice, consent text, breach procedure | PRD, legal advice | Next |
| 8 | **Test plan** | Full list of cases behind section 16 with pass criteria | PRD, API spec | Next |
| 9 | **Deployment and installation guide** | Cloud setup, installer build, school PC setup, activation, network steps | Build spec | Before the pilot |
| 10 | **Operations runbook and exam-day checklist** | Backup, restore, update, replace a dead server, what to do when an exam fails. One page for school staff | Deployment guide | Before the pilot |
| 11 | **Question import templates and samples** | The Excel and Word templates, with sample files and a teacher guide | Import design | Before the pilot |
| 12 | **Project plan and statement of work** | Milestones, deliverables, payments, change requests, acceptance. Contract wording | Pricing, PRD | Before signing |
| 13 | **Quotation and licence terms** | Build fee, per-student fee, server support fee, hardware, what is included and excluded | Pricing page, site survey | Before signing |
| 14 | **Training materials** | Guides and short videos for admins, teachers, invigilators and parents | Working product | Before go-live |
| 15 | **Architecture decision records** | One short note per major decision, with the reasons. Starts from the decisions log in section 2 | This document | Ongoing |

**Status.** Documents 1 to 5 are written as `CBT-01-Product-Requirements.md`, `CBT-02-Data-Model.md`, `CBT-03-API-and-Sync-Specification.md`, `CBT-04-Build-Specification.md` and `CBT-05-Site-Survey-Checklist.md`. Document 5 can be done before the rest because the school's answers change the installer scope and the quote. Documents 6 to 15 are still to write.

---

## 20. Glossary

| Term | Meaning |
|---|---|
| **CBT** | Computer-based test |
| **Cloud (control plane)** | The hosted half of the platform: portals, API, database |
| **Exam server** | The program on the lab PC that runs exams |
| **Exam pack** | A signed bundle with one exam's questions, settings and encrypted keys |
| **Sitting** | One run of an exam in the lab |
| **Session** | One student's attempt within a sitting |
| **Exam key** | Six-digit code shown by the invigilator for one sitting |
| **Student code** | The student's permanent identifier |
| **Outbox** | Local table of events waiting to be sent to the cloud |
| **Idempotency key** | A unique ID that makes resending the same event harmless |
| **Freeze** | The cut-off after which an exam can no longer change without a new pack version |
| **WAL** | SQLite's write-ahead log mode, safe for frequent small writes |
| **NDPA** | Nigeria Data Protection Act 2023 |
