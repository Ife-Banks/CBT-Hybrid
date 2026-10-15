# CBT Platform: 03 API and Sync Specification

Version 1.0 · 11 October 2026 · Status: draft for review

This document defines every interface in the platform:

1. The **Cloud API**, used by the Admin, Teacher and Parent portals.
2. The **Sync API**, used by the school exam server to talk to the cloud.
3. The **School Exam API**, used by the student exam client and the invigilator console on the lab server.

It also defines the **pack format**, the **marking rules**, the **sync event payloads** and the **USB fallback files**.

Companion documents: `CBT-Technical-Design.md` (how it fits together), `CBT-01-Product-Requirements.md` (what it must do, `US-` stories and `BR-` rules), `CBT-02-Data-Model.md` (tables). A coding agent should read all three before this one.

---

## Contents

1. [Conventions](#1-conventions)
2. [Error catalogue](#2-error-catalogue)
3. [Cloud API: sign-in and sessions](#3-cloud-api-sign-in-and-sessions)
4. [Cloud API: invitations and activation](#4-cloud-api-invitations-and-activation)
5. [Cloud API: people (teachers, guardians, students, codes)](#5-cloud-api-people)
6. [Cloud API: academic structure](#6-cloud-api-academic-structure)
7. [Cloud API: question bank and imports](#7-cloud-api-question-bank-and-imports)
8. [Cloud API: exams, sittings and packs](#8-cloud-api-exams-sittings-and-packs)
9. [Cloud API: results, release and re-marking](#9-cloud-api-results-release-and-re-marking)
10. [Cloud API: Parent Portal](#10-cloud-api-parent-portal)
11. [Cloud API: dashboards, notifications, settings, audit, exports](#11-cloud-api-dashboards-notifications-settings-audit-exports)
12. [Cloud API: Platform Owner and school servers](#12-cloud-api-platform-owner-and-school-servers)
13. [Sync API (school server to cloud)](#13-sync-api)
14. [Pack format, answer keys and marking](#14-pack-format-answer-keys-and-marking)
15. [Sync event payloads](#15-sync-event-payloads)
16. [School Exam API (student client)](#16-school-exam-api-student-client)
17. [School Console API and live updates](#17-school-console-api-and-live-updates)
18. [USB fallback files](#18-usb-fallback-files)
19. [Permissions summary](#19-permissions-summary)
20. [Limits and defaults](#20-limits-and-defaults)

---

## 1. Conventions

### 1.1 Base URLs

| Interface | Base URL | Who calls it |
|---|---|---|
| Cloud API | `https://<cloud-host>/api/v1` | Browser portals (cookie session) |
| Sync API | `https://<cloud-host>/sync/v1` | School exam server (signed requests) |
| School Exam API | `http://<server-ip>:8080/api/v1/exam` | Student exam client (bearer token) |
| School Console API | `http://<server-ip>:8080/api/v1/console` | Invigilator console (bearer token) |
| Console WebSocket | `ws://<server-ip>:8080/ws/console?token=<token>` | Invigilator console |

### 1.2 Format rules

| Topic | Rule |
|---|---|
| Body | JSON, UTF-8, `Content-Type: application/json`. File uploads use `multipart/form-data` |
| Field names | `snake_case` |
| IDs | UUIDv7 as strings. Sync events and sessions use IDs generated on the school server (same format) |
| Times | ISO-8601 UTC with milliseconds, for example `2026-10-11T09:30:00.000Z`. The UI converts to `Africa/Lagos` |
| Money | Integer kobo. Fees are Phase 2 |
| Phone numbers | Accepted in local style (`08012345678`) or international, stored and returned as E.164 (`+2348012345678`) |
| Empty values | Omit optional fields or send `null`. Never send empty strings for IDs |
| Validation | Every request body and query is validated with the Zod schemas in `packages/shared-types`. The same schema generates the TypeScript types for the frontends |

### 1.3 Authentication

| Interface | Mechanism |
|---|---|
| Cloud API | HttpOnly, Secure, SameSite=Lax cookie `cbt_session`. Unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`) also need the header `X-CSRF-Token`, whose value comes from `GET /auth/me` and the `cbt_csrf` cookie (double-submit) |
| Sync API | HMAC-signed requests (section 13.2). No cookies |
| School Exam API | `Authorization: Bearer <token>` returned by `/exam/login` and `/exam/start` |
| School Console API | `Authorization: Bearer <token>` returned by `/console/login` |

Every cloud request runs through, in order: authentication, licence check (read-only mode after expiry, US-1.3), role check (CASL), tenant scoping by `school_id`, then the handler. A handler never trusts a `school_id` from the request body.

### 1.4 Errors

All errors use `application/problem+json`:

```json
{
  "type": "https://docs.example.com/errors/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "code": "VALIDATION_FAILED",
  "detail": "2 fields are invalid",
  "errors": [
    { "field": "options[1].body", "code": "REQUIRED", "message": "Option text is required" }
  ],
  "request_id": "01JA3Z6F2K8W4V0Q9E5T7N1XYB"
}
```

`code` is stable and machine readable. `detail` and `message` are plain English for people. See section 2.

### 1.5 Lists and pagination

Cursor pagination on every list endpoint:

```
GET /students?class_id=...&limit=50&cursor=<opaque>
→ { "data": [ ... ], "next_cursor": "..." | null, "total": 412 }
```

`limit` default 50, max 200. `total` is included on lists under 10,000 rows. Sorting is fixed per endpoint, with `sort=` only where stated.

### 1.6 Idempotency

- Cloud `POST` calls that create something expensive or visible (`/results/release`, `/imports/:id/confirm`, `/exams/:id/publish`) accept an `Idempotency-Key` header. A repeat with the same key and body returns the first response for 24 hours.
- Sync uploads use `event_id` (section 15), not headers.
- Student answer saves use a `seq` counter (section 16).

### 1.7 Rate limits

| Endpoint group | Limit |
|---|---|
| `POST /auth/login` | 10 per minute per IP and 5 failed per account before the lockout in US-2.8 |
| OTP send (`/invitations/otp`, `/auth/password/forgot`) | 1 per minute and 5 per hour per contact, plus the school's monthly SMS cap (BR-21) |
| OTP verify and claim | 5 wrong codes lock that code (BR-03) |
| Student `/exam/login` | 5 failures per seat lock the seat for 1 minute (US-10.1) |
| Console `/console/login` | 5 wrong PINs lock the console for 5 minutes (BR-20) |
| Other cloud endpoints | 300 per minute per user |

When limited the server answers `429 RATE_LIMITED` with `Retry-After` (seconds).

### 1.8 Versioning

- Cloud API: `/v1`. A breaking change means `/v2` while `/v1` keeps working for one term.
- Sync protocol: header `X-Sync-Protocol: 1`. The cloud answers `426 SYNC_PROTOCOL_UNSUPPORTED` and includes `min_version` if a school server is too old to talk to it.
- Pack format: `format_version` in the manifest. A school server refuses a pack format it does not know and reports it in the heartbeat.
- Every school server reports its software version in the heartbeat. The cloud keeps support for the last two minor versions.

---

## 2. Error catalogue

| HTTP | `code` | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed JSON or unsupported parameter |
| 401 | `AUTH_REQUIRED` | No or expired session |
| 401 | `INVALID_CREDENTIALS` | Wrong identifier or password. Same message for unknown accounts |
| 401 | `TOTP_REQUIRED` | Admin account needs the authenticator code |
| 401 | `TOTP_INVALID` | Wrong authenticator code |
| 401 | `CLOCK_SKEW` | Sync request time is more than 5 minutes from the cloud. Response includes `server_time` |
| 401 | `SIGNATURE_INVALID` | Sync signature check failed or nonce reused |
| 403 | `FORBIDDEN` | Role is not allowed |
| 403 | `LICENCE_EXPIRED` | Write attempted on an expired school (read-only mode) |
| 403 | `DEVICE_REVOKED` | School server keys were revoked |
| 404 | `NOT_FOUND` | Does not exist, or exists but the caller may not know it (parents get this for other families' children) |
| 409 | `CONFLICT` | State prevents the action |
| 409 | `GUARDIAN_MATCH_FOUND` | A guardian with this phone or email exists. Response lists `matches` |
| 409 | `EXAM_FROZEN` | Edit needs `acknowledge_new_pack_version: true` (BR-11) |
| 410 | `INVITE_EXPIRED` | Invitation past its expiry |
| 410 | `INVITE_USED` | Invitation already claimed |
| 410 | `INVITE_REVOKED` | Invitation withdrawn |
| 400 | `OTP_INVALID` | Wrong one-time code. Response includes `attempts_left` |
| 429 | `OTP_LOCKED` | Too many wrong codes. Request a new code after the cooldown |
| 423 | `ACCOUNT_LOCKED` | Too many failed sign-ins. Includes `locked_until` |
| 422 | `VALIDATION_FAILED` | Field errors in `errors[]` |
| 422 | `EXAM_NOT_PUBLISHABLE` | Pack blocked. `errors[]` lists questions without keys or an empty exam |
| 422 | `IMPORT_FILE_REJECTED` | Wrong type, macros, too large or unreadable |
| 429 | `RATE_LIMITED` | See 1.7 |
| 426 | `SYNC_PROTOCOL_UNSUPPORTED` | School server software too old |
| 500 | `INTERNAL` | Unexpected. `request_id` is logged |

Student exam client codes (school server), kind and specific as US-10.1 requires:

| HTTP | `code` | Message shown to the student |
|---|---|---|
| 422 | `CODE_FORMAT_INVALID` | "That code doesn't look right. Check it and try again." (check character failed, no lookup done) |
| 404 | `CODE_NOT_FOUND` | "We can't find that code. Ask your teacher." |
| 403 | `CODE_REVOKED` | "This code is no longer valid. Ask your teacher for a new one." |
| 401 | `KEY_INVALID` | "The exam key is wrong. Ask the invigilator." |
| 403 | `NOT_IN_SITTING` | "This exam isn't for your class." |
| 409 | `SITTING_NOT_OPEN` | "This exam hasn't started yet." or "This exam has ended." |
| 409 | `ALREADY_SUBMITTED` | "You have already finished this exam." |
| 409 | `SESSION_ACTIVE_ELSEWHERE` | "You are signed in on another computer. Ask the invigilator." Allowed once the other seat has been offline 30 seconds or the invigilator releases it (US-9.8) |
| 429 | `SEAT_LOCKED` | "Too many tries. Wait a minute." Includes `retry_after` |
| 409 | `SESSION_CLOSED` | On answer saves after submission or timeout. Includes the final `status` |

---

## 3. Cloud API: sign-in and sessions

Public unless stated. Covers US-2.8, US-2.9, US-2.10.

### 3.1 `POST /auth/login`

```json
// request
{ "identifier": "ada@school.ng", "password": "••••••••••", "totp": "123456" }
```

`identifier` is an email or a phone number. `totp` is needed only if two-step verification is on.

```json
// 200 response, also sets cbt_session and cbt_csrf cookies
{
  "user": {
    "id": "0192...", "role": "teacher", "full_name": "Ada Okafor",
    "school": { "id": "0192...", "code": "GRA", "name": "Graceland College" },
    "must_change_password": false
  },
  "csrf_token": "..."
}
```

Errors: `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `TOTP_REQUIRED`, `TOTP_INVALID`, `RATE_LIMITED`.
Session lifetime: 12 hours for staff, 30 days (sliding) for parents (US-2.8). Lockout: 5 failed attempts lock the account 15 minutes.

### 3.2 Other session endpoints

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `POST` | `/auth/logout` | any signed in | Ends this session |
| `GET` | `/auth/me` | any signed in | Current user, role, school, licence state, `csrf_token` |
| `GET` | `/auth/sessions` | any signed in | List own active sessions (device, last seen) |
| `DELETE` | `/auth/sessions/:id` | any signed in | Sign out another device |
| `POST` | `/auth/password/change` | any signed in | Body `{ "current_password", "new_password" }`. Revokes other sessions |
| `POST` | `/auth/password/forgot` | public | Body `{ "identifier" }`. Always `202 { "challenge_id" }`, whether or not the account exists |
| `POST` | `/auth/password/reset` | public | Body `{ "challenge_id", "code", "new_password" }`. Revokes all sessions. Errors `OTP_INVALID`, `OTP_LOCKED` |
| `POST` | `/auth/2fa/setup` | admin roles | Returns `{ "otpauth_uri", "secret" }` for the QR code |
| `POST` | `/auth/2fa/enable` | admin roles | Body `{ "code" }`. Returns `{ "recovery_codes": [ ... 10 codes ... ] }` shown once |
| `POST` | `/auth/2fa/disable` | admin roles (not first admin or Platform Owner) | Body `{ "password", "code" }` |

Password rules (all setters): at least 10 characters, not in the common-passwords list, not equal to the email or phone. `422 VALIDATION_FAILED` with field `new_password` on failure.

The reset code is a 6-digit one-time code sent to the contact on file (email for staff, phone or email for parents). The email also carries a link that pre-fills the code. A reset is audit logged.

---

## 4. Cloud API: invitations and activation

Covers US-2.1 to US-2.7 and PRD section 5. The public endpoints are what the invite link opens.

### 4.1 Public: claim an invitation

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/invitations/lookup?token=<token>` | Check a link and get what the page needs |
| `POST` | `/invitations/otp` | Send the one-time code to the registered contact |
| `POST` | `/invitations/claim` | Set the password and activate |

`GET /invitations/lookup`:

```json
// 200
{
  "kind": "guardian",                      // staff | guardian
  "school": { "name": "Graceland College" },
  "display_name": "Mrs Adeyemi",
  "role": "parent",
  "contact_hint": "+234 ••• ••• 5678",     // masked registered contact
  "needs_otp": true,                        // BR-03
  "expires_at": "2026-10-25T09:00:00.000Z"
}
```

Errors: `INVITE_EXPIRED`, `INVITE_USED`, `INVITE_REVOKED` (all `410`), or `404 NOT_FOUND` for an unknown token. A failed lookup shows no personal data.

`POST /invitations/otp`:

```json
// request
{ "token": "..." }
// 202 response
{ "challenge_id": "0192...", "resend_after_seconds": 60, "expires_in_seconds": 600 }
```

The code goes to the contact on file, never to a contact typed by the caller (BR-03). Channel: SMS or WhatsApp if the guardian has a phone and the school has paid channels enabled and cap left, otherwise email, otherwise `422` with a message to ask the school.

`POST /invitations/claim`:

```json
// request
{
  "token": "...",
  "challenge_id": "0192...",     // required when needs_otp is true
  "code": "482913",              // required when needs_otp is true
  "password": "••••••••••",
  "accept_terms": true
}
// 200 response: signs the person in (cookies set) and returns the same body as /auth/login
```

Effects, in one transaction: user `status` becomes `active`, `password_hash` set, invitation `used`, guardian linked to its user, audit entry `invitation.claimed`.

**When `needs_otp` is false.** Only staff invites sent by email to the registered email address (BR-03). The link itself proves control of that mailbox. A copied link (`channel = manual_link`) always needs the code.

### 4.2 Admin: manage invitations

Role: School Admin. Platform Owner for the first admin.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/invitations?state=&role=&class_id=&search=` | Invitations list (US-2.7) |
| `POST` | `/invitations/:id/resend` | New token, old one revoked. Body `{ "channel": "sms"\|"whatsapp"\|"email" }` (optional) |
| `POST` | `/invitations/:id/revoke` | Withdraw |
| `GET` | `/invitations/:id/link` | Returns `{ "url" }` for copy and paste. Marks channel `manual_link`. Audit logged |
| `POST` | `/invitations/bulk-resend` | Body `{ "state": "pending"\|"expired", "role", "class_id" }`. Returns `{ "queued": 37 }` |
| `GET` | `/invitations/slips.pdf?ids=...` | Printable slips with QR code and instructions. The token is created on request. Logged |

Invitation states: `pending`, `sent`, `used`, `expired`, `revoked`, `failed` (data model section 2.2).

Cost control: sending by SMS or WhatsApp checks the school's monthly cap first (US-13.3). Over the cap returns `409 CONFLICT` with `code: "SMS_CAP_REACHED"` and the admin can choose email or a printed slip.

---

## 5. Cloud API: people

### 5.1 Teachers and admins

Role: School Admin. Covers US-2.1, US-2.2, US-2.11.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/teachers?status=&search=` | List with status `invited`, `active`, `suspended`, `deactivated` |
| `POST` | `/teachers` | Create and optionally invite |
| `GET` | `/teachers/:id` | Detail with assignments |
| `PATCH` | `/teachers/:id` | Edit name, phone, staff number. Changing email while `invited` revokes the old invite and sends a new one |
| `POST` | `/teachers/:id/suspend` | Immediate. Ends all sessions |
| `POST` | `/teachers/:id/deactivate` | As above, plus removal from new assignments. Questions and exams stay |
| `POST` | `/teachers/:id/reactivate` | Back to `active` if a password exists, otherwise `invited` again |
| `POST` | `/admins` | Invite another School Admin. Body `{ "full_name", "email" }` |
| `POST` | `/imports` | Bulk teachers: `kind = teachers` (section 7.6) |

`POST /teachers`:

```json
{
  "full_name": "Ada Okafor",
  "email": "ada@school.ng",
  "phone": "08012345678",
  "staff_no": "T-014",
  "send_invite": true
}
```

201 returns the teacher and, if `send_invite`, the invitation `{ id, channel: "email", status: "sent", expires_at }`. Duplicate email in the school returns `409 CONFLICT`.

### 5.2 Guardians (parents)

Role: School Admin. Covers US-2.4, US-2.12, US-4.5 to US-4.7 and BR-02, BR-04, BR-05, BR-06.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/guardians?search=&class_id=&status=` | List with child count and invite or account status |
| `POST` | `/guardians` | Create, link children, optionally invite |
| `GET` | `/guardians/:id` | Detail with children and invitation history |
| `PATCH` | `/guardians/:id` | Edit name, phone, email. A changed contact revokes pending invites to the old contact and is audit logged (US-2.12) |
| `POST` | `/guardians/:id/children` | Link a child |
| `PATCH` | `/guardians/:id/children/:student_id` | Change `relationship` or `can_view_results` (BR-06) |
| `DELETE` | `/guardians/:id/children/:student_id` | Unlink |
| `POST` | `/guardians/:id/invite` | (Re)send an invitation. Body `{ "channel": "sms"\|"whatsapp"\|"email"\|"printed" }` |
| `POST` | `/guardians/:id/suspend` | Immediate. Ends sessions |
| `POST` | `/guardians/merge` | Body `{ "keep_id", "merge_id" }`. Moves links, keeps one account |

`POST /guardians`:

```json
{
  "full_name": "Mrs Adeyemi",
  "phone": "08012345678",
  "email": null,
  "relationship_default": "mother",
  "children": [
    { "admission_no": "GRA/2023/0412", "relationship": "mother", "can_view_results": true },
    { "student_id": "0192...", "relationship": "mother" }
  ],
  "send_invite": true,
  "channel": "whatsapp"
}
```

Rules:

- Needs a phone or an email (BR-02). Otherwise `422` with field `phone`.
- **Matching (BR-04).** The server normalises the phone to E.164 and looks for a guardian in the same school with that phone, then that email. If one exists the response is `409 GUARDIAN_MATCH_FOUND`:

```json
{
  "code": "GUARDIAN_MATCH_FOUND",
  "matches": [ { "id": "0192...", "full_name": "Mrs Folake Adeyemi", "phone_hint": "+234 ••• 5678", "children_count": 2 } ]
}
```

  The admin then repeats the request with `"use_existing_guardian_id": "0192..."` (adds the children to that guardian) or `"force_new": true` (only allowed if the phone differs and the match was by email or name). The same phone can never belong to two guardians in a school (unique index).
- Each child is identified by `student_id` or by `admission_no`. An unknown admission number returns `422` with field `children[n].admission_no`.
- A guardian is created without a user. The user is created when the invite is claimed, so the guardian list shows `invited` or `active` from the invitation and user status.
- Responses include `account_status: "no_invite" | "invited" | "active" | "suspended"`.

### 5.3 Students

Role: School Admin (full), Teacher (read, assigned classes only), Class Teacher (read, own class). Covers US-4.1 to US-4.4, US-4.8, US-4.9, US-3.6.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/students?class_id=&status=&search=` | List |
| `POST` | `/students` | Create. Generates the student code. Body `{ "first_name", "last_name", "other_names", "admission_no", "gender", "date_of_birth", "class_id" }` |
| `GET` | `/students/:id` | Detail with guardians, class, code status (not the code), consent |
| `PATCH` | `/students/:id` | Edit details |
| `POST` | `/students/:id/status` | Body `{ "status": "active"\|"withdrawn"\|"graduated", "reason" }` |
| `POST` | `/students/:id/class` | Body `{ "class_id", "academic_year_id" }`. Moves enrolment |
| `POST` | `/students/:id/codes/reissue` | Body `{ "reason" }`. Revokes the active code and issues a new one. Returns `{ "code" }` once. Audit logged |
| `GET` | `/classes/:id/code-sheet.pdf` | Printable slips (name, class, code). Generated on request, logged |
| `POST` | `/students/:id/consents` | Body `{ "kind", "granted_at", "evidence" }` |
| `POST` | `/classes/:id/consents/bulk` | Marks consent collected for the class |
| `POST` | `/students/promotions/preview` | Body `{ "from_academic_year_id", "to_academic_year_id", "mapping": [ { "from_class_id", "to_class_id" \| "graduate": true } ] }`. Returns who moves where |
| `POST` | `/students/promotions/apply` | Applies a previewed promotion. Needs `preview_id` |
| `POST` | `/students/:id/data-export` | Returns a ZIP of the student's data (US-16.2) |
| `POST` | `/students/:id/anonymise` | Replaces identity fields, keeps scores if the school's retention rule says so. Audit logged |
| `POST` | `/imports` | Bulk students: `kind = students` |

A student code is never returned by the list or detail endpoints. It appears only in the reissue response, the create response and the code-sheet PDF. The code format and check character are in `CBT-04-Build-Specification.md` section 4.

---

## 6. Cloud API: academic structure

Role: School Admin writes. Teachers read what concerns them. Covers US-3.1 to US-3.7.

| Method | Path | Purpose |
|---|---|---|
| `GET` `POST` | `/academic-years` | List and create |
| `PATCH` | `/academic-years/:id` | Edit |
| `POST` | `/academic-years/:id/set-current` | Exactly one current year |
| `GET` `POST` | `/terms` (`?academic_year_id=`) | List and create |
| `PATCH` | `/terms/:id` | Edit |
| `POST` | `/terms/:id/set-current` | Exactly one current term |
| `GET` `POST` | `/levels` | `{ "name": "JSS 2", "section": "secondary", "sort_order": 8 }` |
| `PATCH` `DELETE` | `/levels/:id` | Delete only when empty |
| `GET` `POST` | `/classes` (`?academic_year_id=&level_id=`) | `{ "name": "JSS 2 Gold", "level_id", "academic_year_id", "class_teacher_id" }` |
| `PATCH` `DELETE` | `/classes/:id` | Delete only when empty |
| `PUT` | `/classes/:id/class-teacher` | Body `{ "teacher_id" \| null }` (US-3.5) |
| `GET` `POST` | `/subjects` | `{ "name": "Mathematics", "code": "MTH" }` |
| `PATCH` `DELETE` | `/subjects/:id` | Delete only when unused |
| `GET` | `/classes/:id/subjects` | Assignments for a class |
| `PUT` | `/classes/:id/subjects` | Replace assignments: `{ "assignments": [ { "subject_id", "teacher_id" } ] }` (US-3.4) |
| `GET` | `/teachers/:id/assignments` | A teacher's classes and subjects |
| `POST` | `/classes/:id/students` | Add students to a class: `{ "student_ids": [ ... ] }` |
| `GET` `PUT` | `/grade-scale` | `{ "bands": [ { "min": 70, "max": 100, "grade": "A", "remark": "Excellent" } ] }`. Bands must cover 0 to 100 without gaps or overlap, else `422` (US-3.7) |

The class `section` (primary or secondary) comes from its level and decides which exam client the student sees. It is included in the roster sent to the school server.

---

## 7. Cloud API: question bank and imports

Roles: Teacher (own subjects and classes), School Admin. Covers US-5.x and US-6.x, BR-12, BR-13, BR-19.

### 7.1 Question shape

```json
{
  "id": "0192...",
  "subject_id": "0192...",
  "level_id": "0192...",
  "type": "single_choice",                  // single_choice | multi_choice | true_false | fill_blank
  "stem": "<p>What is $2^3$?</p>",         // sanitised HTML subset, maths as $...$ (LaTeX)
  "options": [
    { "id": "0192...", "label": "A", "body": "6",  "is_correct": false },
    { "id": "0192...", "label": "B", "body": "8",  "is_correct": true  },
    { "id": "0192...", "label": "C", "body": "9",  "is_correct": false }
  ],
  "fill_answers": null,                     // fill_blank only: { "answers": ["Abuja"], "case_sensitive": false }
  "marks": 1,
  "difficulty": "easy",                     // easy | medium | hard | null
  "topic": "Indices",
  "explanation": "2 × 2 × 2 = 8",
  "asset_ids": [],
  "status": "draft",                        // draft | approved | retired
  "version": 1,
  "supersedes_id": null,
  "created_by": "0192...",
  "created_at": "2026-10-11T09:30:00.000Z"
}
```

Validation by type (`422` with field errors):

| Type | Rules |
|---|---|
| `single_choice` | 2 to 6 options, exactly one `is_correct` |
| `multi_choice` | 2 to 6 options, at least one `is_correct` |
| `true_false` | The server creates the options "True" and "False". Send `"correct": true` or `false` instead of options |
| `fill_blank` | No options. `fill_answers.answers` has 1 to 10 non-empty strings of up to 200 characters |
| all | `stem` required. `marks` between 0.5 and 20 (default 1). Stem is sanitised to a safe subset (paragraphs, bold, italic, lists, sub, sup, images from uploaded assets) |

### 7.2 Question endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/questions?subject_id=&level_id=&topic=&difficulty=&status=&type=&q=&mine=true` | Search. Teachers see their own plus approved questions in their subjects (US-5.6) |
| `POST` | `/questions` | Create. Status `draft`, or `approved` if the school has the approval step off (US-5.4) |
| `GET` | `/questions/:id` | Detail |
| `PATCH` | `/questions/:id` | `draft`: edits in place. `approved`: creates a new version (BR-12). Returns `201` with the new question and `supersedes_id`; the old one becomes `retired` once no unfrozen exam uses it |
| `POST` | `/questions/:id/approve` | School Admin, or the author if approval is off |
| `POST` | `/questions/:id/retire` | Hide from new exams |
| `POST` | `/questions/:id/duplicate` | Copy as a new draft |
| `GET` | `/questions/:id/preview?style=primary\|secondary` | Student view with answers hidden (US-5.7) |
| `POST` | `/assets` | Upload an image (`multipart`, field `file`). Returns `{ "id", "url", "width", "height" }` after resizing (US-5.2) |
| `GET` | `/assets/:id` | Redirects to a short-lived URL |

### 7.3 Imports (all kinds)

One mechanism covers questions, students, guardians and teachers (US-2.2, US-4.2, US-4.6, US-6.2 to US-6.5).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/imports/templates/:kind.:ext` | Download template. `kind` is `questions`, `students`, `guardians`, `teachers`. `ext` is `xlsx`, `csv` or (questions only) `docx` |
| `POST` | `/imports` | Upload. `multipart` fields: `kind`, `file`, and for questions `subject_id`, `level_id` |
| `GET` | `/imports/:id` | Status and counts |
| `GET` | `/imports/:id/rows?status=&cursor=` | Preview rows |
| `PATCH` | `/imports/:id/rows/:row_id` | Fix a row: `{ "parsed": { ... } }`. Re-validates it |
| `POST` | `/imports/:id/rows/:row_id/skip` | Exclude a row |
| `POST` | `/imports/:id/confirm` | Create the records. Idempotent |
| `DELETE` | `/imports/:id` | Cancel. Nothing is created |
| `GET` | `/imports?kind=&mine=true` | History (US-6.6) |

`kind` values in requests: `questions` (the server detects `.docx` or `.xlsx`/`.csv` from the file), `students`, `guardians`, `teachers`. The stored `import_jobs.kind` is `questions_docx`, `questions_xlsx`, `students`, `guardians` or `teachers`.

Flow:

1. `POST /imports` returns `202 { "id", "status": "queued" }`.
2. A background job parses the file. Status moves `queued`, `parsing`, `parsed` (or `failed` with `failure_reason`). The page polls `GET /imports/:id` every 2 seconds.
3. Rows are listed with a status:

| Row status | Meaning |
|---|---|
| `ok` | Valid |
| `warning` | Importable but check it, for example a likely duplicate of an existing question or student |
| `error` | Cannot be imported until fixed or skipped |
| `skipped` | Excluded by the user |
| `imported` | Created |

Each row has `row_no`, `raw` (what was in the file), `parsed` (what the server understood) and `errors` (list of `{ field, code, message }`).

4. `POST /imports/:id/confirm` creates every `ok` and `warning` row not skipped, in one transaction per 100 rows. Question imports create **drafts**, never exam entries (US-6.5). Response:

```json
{ "created": 38, "skipped": 2, "fixed": 4, "report_url": "/imports/0192.../report.csv" }
```

Question import error codes in rows: `MISSING_ANSWER`, `ANSWER_MATCHES_NO_OPTION`, `DUPLICATE_OPTIONS`, `LIKELY_DUPLICATE`, `UNSUPPORTED_TYPE`, `TOO_FEW_OPTIONS`, `IMAGE_NOT_FOUND`, `MARKS_INVALID`.

Guardian import: rows with the same normalised phone become one guardian linked to all the listed admission numbers (US-4.6). A match with an existing guardian is a `warning` with the match in `errors[]` and the admin decides on the preview.

Templates and column layouts are defined in `CBT-04-Build-Specification.md` section 9.

### 7.4 Rejected files (`IMPORT_FILE_REJECTED`)

`.docm` or any file with macros, files over 10 MB, more than 200 questions in one question file (5,000 rows for student and guardian files), unreadable or password-protected files, and files whose real type does not match the extension.

---

## 8. Cloud API: exams, sittings and packs

Roles: Teacher (assigned subject and class), School Admin. Covers Epic 7.

### 8.1 Exam shape

```json
{
  "id": "0192...",
  "title": "JSS 2 Mathematics, First Term Exam",
  "subject_id": "0192...",
  "term_id": "0192...",
  "kind": "exam",                            // test | exam | practice
  "class_ids": ["0192...", "0192..."],
  "duration_min": 60,
  "shuffle_questions": true,
  "shuffle_options": true,
  "show_score_to_student": false,
  "pass_mark_pct": 40,
  "instructions": "<p>Answer all questions.</p>",
  "questions": [ { "question_id": "0192...", "position": 1, "marks": 1 } ],
  "total_marks": 40,
  "status": "draft",                         // draft | ready | published | archived
  "frozen": false,                            // derived (data model 2.7)
  "pack": { "latest_version": 2, "latest_status": "ready", "school_server_ready": false }
}
```

### 8.2 Exam endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/exams?term_id=&subject_id=&class_id=&status=` | List |
| `POST` | `/exams` | Create |
| `GET` | `/exams/:id` | Detail |
| `PATCH` | `/exams/:id` | Edit settings. If frozen, needs `acknowledge_new_pack_version: true` (BR-11, US-7.5) |
| `PUT` | `/exams/:id/questions` | Replace the ordered list: `{ "items": [ { "question_id", "marks": 2 } ] }`. Same freeze rule |
| `POST` | `/exams/:id/duplicate` | Copy to a new draft (US-7.9) |
| `POST` | `/exams/:id/archive` | Hide |
| `DELETE` | `/exams/:id` | Draft with no sittings only |
| `GET` | `/exams/:id/preview?style=primary\|secondary` | Full student view, answers hidden (US-7.3) |
| `POST` | `/exams/:id/publish` | Build a pack. `202 { "pack": { "id", "version", "status": "building" } }`. Needs `Idempotency-Key` |
| `GET` | `/exams/:id/packs` | Pack versions with status and which school servers hold them |
| `GET` | `/exams/:id/readiness` | `{ "pack_version", "frozen", "school_server": { "device_id", "last_seen_at", "pack_loaded": true, "verified": true } }` |
| `GET` | `/exams/:id/packs/:version/usb` | ZIP for USB loading (section 18). Needs `?device_id=` |

`POST /exams/:id/publish` fails with `422 EXAM_NOT_PUBLISHABLE` if there are no questions, a question has no correct answer, or a question is not `approved`. `errors[]` lists the question IDs.

Pack versions: every publish after a content change creates `version + 1` and marks the previous `superseded` (US-7.7). If an exam has a sitting inside the freeze window and has no pack for its current content, the system builds one automatically at the freeze time (24 hours before) and notifies the exam owner.

### 8.3 Sittings

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/sittings?from=&to=&status=&exam_id=&class_id=` | Calendar and lists |
| `POST` | `/exams/:id/sittings` | Schedule: `{ "class_id", "window_start", "window_end" }` |
| `GET` | `/sittings/:id` | Detail with school server state and attendance |
| `PATCH` | `/sittings/:id` | Reschedule (US-7.8) |
| `POST` | `/sittings/:id/cancel` | Cancel. The school server learns at its next sync |
| `POST` | `/sittings/:id/makeup` | Create a make-up sitting of the same exam: `{ "window_start", "window_end" }` (US-11.5, BR-17) |
| `GET` | `/sittings/:id/attendance` | Who sat, who was absent, and who is still in progress |

`POST /exams/:id/sittings` returns `201` plus `warnings: [ { "code": "SITTING_OVERLAP", "sitting_id": "0192..." } ]` if another sitting overlaps in time (US-7.4). Warnings do not block.

Window rules (BR-16): `window_end` must be after `window_start` plus the exam duration. A student's time ends at the earlier of start plus duration plus extra time, and `window_end`.

---

## 9. Cloud API: results, release and re-marking

Roles: Teacher (assigned classes), Class Teacher (own class), School Admin. Covers Epic 11, Epic 12 (release), BR-13 to BR-15.

### 9.1 Result shape

```json
{
  "id": "0192...",
  "student": { "id": "0192...", "full_name": "Tunde Bello", "admission_no": "GRA/2023/0412" },
  "exam_id": "0192...", "class_id": "0192...",
  "score": 34, "max_score": 40, "percent": 85, "grade": "A",
  "status": "draft",                     // draft | reviewed | released | withdrawn
  "revision": 1,
  "submitted_at": "2026-10-20T09:41:12.000Z",
  "submit_reason": "student",
  "integrity": { "focus_lost_count": 0, "extra_seconds": 0 }
}
```

### 9.2 Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/results?exam_id=&class_id=&status=&cursor=` | List draft, reviewed and released results (US-11.2). Includes `last_synced_at` for the exam |
| `GET` | `/results/:id` | Detail with each answer, correct answer and marks (teachers and admins only) |
| `GET` | `/exams/:id/stats?class_id=` | Average, highest, lowest, pass rate, and per question percent correct plus option choice counts (US-11.3) |
| `POST` | `/results/review` | Mark reviewed. Body `{ "result_ids": [...] }` or `{ "exam_id", "class_id" }` |
| `POST` | `/results/release` | Release reviewed results. Body `{ "exam_id", "class_id", "notify": true }`. Needs `Idempotency-Key`. Returns `{ "released": 31, "notifications_queued": 44 }` |
| `POST` | `/results/withdraw` | Body `{ "result_ids": [...], "reason" }`. Parents see "under review" (US-12.7) |
| `GET` | `/exams/:id/results.xlsx?class_id=` | Class results sheet (US-11.6) |
| `GET` | `/exams/:id/results.pdf?class_id=` | Same as PDF |
| `GET` | `/students/:id/results.pdf` | Student history (US-11.7) |

Release rules:

- Only `reviewed` results can be released (BR-14), otherwise `409 CONFLICT` with the count of unreviewed results.
- Who may release: School Admin always. A Class Teacher only if the school setting `release_policy` is `class_teacher` (section 11.3). Anyone else gets `403 FORBIDDEN`.
- Release creates one notification per linked guardian with `can_view_results = true`, on the channel in BR-21. The message contains no scores.

### 9.3 Correcting an answer key and re-marking

A key correction never edits an approved question (BR-12). It creates a corrected version of the question, swaps it into the exam, bumps the key version, and re-marks stored answers in the cloud. Nothing changes until the teacher confirms (US-11.4).

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/exams/:id/key-corrections` | Preview. Body below. Returns `201` with the run and the preview. Nothing applied |
| `GET` | `/exams/:id/key-corrections/:run_id` | Fetch the preview |
| `POST` | `/exams/:id/key-corrections/:run_id/apply` | Apply. Needs `Idempotency-Key` |
| `POST` | `/exams/:id/key-corrections/:run_id/cancel` | Discard |

```json
// POST /exams/:id/key-corrections
{
  "question_id": "0192...",
  "correct_option_ids": ["0192..."],                  // choice questions
  "fill_answers": null,                                // fill_blank: { "answers": [...], "case_sensitive": false }
  "reason": "Option B was marked correct by mistake"
}
// 201
{
  "id": "0192...", "status": "previewed",
  "new_question_id": "0192...",
  "affected": 7,
  "preview": [ { "student_id": "0192...", "old_score": 33, "new_score": 34 } ]
}
```

On `apply`, in one transaction: the new question version is approved and put in the exam, `exam_packs.key_version` increases and a new pack version is built, every affected submission is re-marked with `exam-core`, each changed result gets `revision + 1`, and an audit entry records who and why. If a changed result was already `released`, it stays released with an "updated" flag and a notification goes to the guardians unless the school turned that off (BR-15). School servers pick up the new pack at the next sync. Sessions already stored in the cloud do not need the school server.

---

## 10. Cloud API: Parent Portal

Role: `parent` only. Every endpoint enforces three things in the query itself: the child is linked to this guardian, the link has `can_view_results = true`, and the result `status` is `released` (BR-05, BR-06, BR-14). For a child that is not linked the answer is `404 NOT_FOUND`, never `403`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/parent/children` | All linked children for the child switcher (US-12.2) |
| `GET` | `/parent/children/:student_id/results?term_id=&subject_id=` | Released results (US-12.3) |
| `GET` | `/parent/children/:student_id/results/:result_id` | One result |
| `GET` | `/parent/children/:student_id/trends?term_id=` | By subject and over terms (US-12.4) |
| `GET` | `/parent/notifications` | In-app notifications |
| `POST` | `/parent/notifications/:id/read` | Mark read |
| `PATCH` | `/parent/me` | `{ "notification_prefs": { "email": true, "sms": false, "whatsapp": true } }` (US-12.6) |
| `POST` | `/parent/me/email/otp` | Add or change email: sends a code to the new address |
| `POST` | `/parent/me/email/verify` | `{ "challenge_id", "code", "email" }` |

`GET /parent/children`:

```json
{
  "data": [
    { "student_id": "0192...", "full_name": "Tunde Bello", "class_name": "JSS 2 Gold",
      "photo_url": null, "results_visible": true, "latest_result_at": "2026-10-22T10:00:00.000Z" },
    { "student_id": "0192...", "full_name": "Ife Bello", "class_name": "Primary 4 Blue",
      "photo_url": null, "results_visible": false, "latest_result_at": null }
  ]
}
```

`results_visible: false` means the school restricted this link (BR-06). The child still shows, and the results list is empty.

A result for a parent:

```json
{
  "result_id": "0192...", "exam_title": "Mathematics, First Term Exam", "subject": "Mathematics",
  "date": "2026-10-20", "score": 34, "max_score": 40, "percent": 85, "grade": "A",
  "class_average_percent": 62.4, "updated": false, "status": "released"
}
```

A withdrawn result is returned as `{ "status": "under_review" }` with no scores. A parent never receives raw answers, the exam code, other students' scores or the student code.

---

## 11. Cloud API: dashboards, notifications, settings, audit, exports

### 11.1 Dashboards

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `GET` | `/dashboard/admin` | School Admin | Upcoming sittings with readiness, results awaiting review, results awaiting release, pending invitations, server health, last sync (US-14.1) |
| `GET` | `/dashboard/teacher` | Teacher | My exams, imports, results to review (US-14.2) |

### 11.2 Notifications

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `GET` | `/notifications/log?status=&channel=&from=&to=` | School Admin | Delivery log (US-13.2) |
| `POST` | `/notifications/:id/retry` | School Admin | Re-queue a failed message |
| `GET` | `/notifications/usage` | School Admin | Paid messages this month against the cap (US-13.3) |

Templates (email, SMS, WhatsApp, in-app) are listed in `CBT-04-Build-Specification.md` section 10. No template contains a score.

### 11.3 Settings

`GET /settings` and `PATCH /settings` (School Admin) read and write `schools.settings`:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `release_policy` | `admin_only` or `class_teacher` | `admin_only` | Who may release results (BR-14) |
| `require_question_approval` | boolean | `false` | Approval step for questions (US-5.4) |
| `notify_on_remark` | boolean | `true` | Tell guardians when a released score changes (BR-15) |
| `paid_channels_enabled` | `{ "sms": bool, "whatsapp": bool }` | both `false` | BR-21 |
| `paid_message_monthly_cap` | integer | `500` | Cap per month (US-13.3) |
| `strict_seats` | boolean | `false` | Block a student at the wrong seat (US-9.4) |
| `retention` | `{ "results_years_after_leaving": 2, "sessions_months": 12 }` | as shown | BR-22 |
| `invite_expiry_days` | `{ "staff": 7, "guardian": 14 }` | as shown | BR-03 |
| `exam_key_digits` | integer | `6` | BR-09 |

Settings that the school server needs (`strict_seats`) are sent down as `setting` changes (section 13.4).

### 11.4 Audit and exports

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `GET` | `/audit-logs?actor_id=&action=&entity=&from=&to=&cursor=` | School Admin, Platform Owner | US-16.1. Read-only. No update or delete endpoint exists |
| `GET` | `/exports/:name.:ext` | School Admin | `name` is `students`, `guardians`, `invitations`, `attendance`, `notifications`, `audit`. `ext` is `xlsx` or `csv` (US-14.3) |

Audit actions include `auth.login`, `auth.login_failed`, `invitation.created`, `invitation.sent`, `invitation.claimed`, `invitation.link_copied`, `user.suspended`, `guardian.contact_changed`, `guardian.link_restricted`, `student.code_reissued`, `code_sheet.generated`, `question.approved`, `exam.published`, `exam.pack_built`, `results.reviewed`, `results.released`, `results.withdrawn`, `key_correction.applied`, `device.activated`, `device.revoked`, `console.*` (reported by the school server), `data.exported`, `student.anonymised`.

---

## 12. Cloud API: Platform Owner and school servers

### 12.1 Platform Owner

Role: `platform_owner` (two-step verification required). Covers US-1.1 to US-1.6.

| Method | Path | Purpose |
|---|---|---|
| `GET` `POST` | `/platform/schools` | List and create. Body `{ "name", "code", "state", "contact_email", "timezone" }`. `code` is 3 to 6 capital letters or digits, unique, and cannot be changed once students exist |
| `GET` `PATCH` | `/platform/schools/:id` | Detail. Licence fields `plan`, `student_cap`, `licence_expires_on`, `status` (US-1.3) |
| `POST` | `/platform/schools/:id/admins` | Invite the first admin: `{ "full_name", "email" }` (US-1.2) |
| `GET` | `/platform/devices` | All school servers with health and flags (US-1.5) |
| `GET` | `/platform/devices/:id` | One server, including its last heartbeat and outbox state |
| `POST` | `/platform/devices/:id/revoke` | US-1.6 |
| `GET` `POST` | `/platform/releases` | List and publish software releases that heartbeats offer |

A new school gets the default grade scale and default settings (US-1.1).

### 12.2 School servers (School Admin and Platform Owner)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/sync-devices/activation-codes` | Create a one-time code, valid 72 hours (US-1.4). Body `{ "device_name": "Lab server", "replaces_device_id": null }`. Platform Owner also passes `school_id`. Returns `{ "code": "K7M2-9QXD-4TWH", "expires_at" }` shown once |
| `GET` | `/sync-devices` | Status of this school's servers: last sync, last backup, version, flags |
| `POST` | `/sync-devices/:id/revoke` | Revoke keys (US-1.6) |
| `POST` | `/sync-devices/:id/pin-reset-code` | Console PIN reset code, valid 1 hour. Returns `{ "code": "58213094", "valid_until" }`. Audit logged (BR-20) |
| `POST` | `/sync-imports` | Upload a `.cbtsync` file from USB (section 18.1). Returns per-event outcomes |
| `GET` | `/sync-devices/:id/backups` | Backups the server uploaded |

The PIN reset code is the first 8 digits of `HMAC-SHA256(device_secret, "pin-reset|" + floor(unix_time / 3600))`, as a decimal number. The school server accepts the codes for the current and the previous hour and verifies them offline.

Health flags (US-1.5): `NO_HEARTBEAT_3D`, `LOW_DISK` (below 5 GB), `BACKUP_OLD` (older than 2 days), `CLOCK_OFF` (more than 2 minutes), `OUTBOX_REJECTED` (any rejected events), `OLD_VERSION`.

---

## 13. Sync API

Called only by the school exam server. The server always initiates. The cloud never connects to the school (Technical Design 9.1).

### 13.1 Overview

| Method | Path | Direction | Purpose |
|---|---|---|---|
| `POST` | `/sync/v1/activate` | up | Register a new server with an activation code (unsigned) |
| `GET` | `/sync/v1/changes` | down | Roster, schedule, pack announcements, settings |
| `GET` | `/sync/v1/packs/:pack_id` | down | Download a pack file (resumable) |
| `GET` | `/sync/v1/packs/:pack_id/key` | down | The pack key wrapped for this server |
| `POST` | `/sync/v1/results` | up | Batch of outbox events |
| `POST` | `/sync/v1/heartbeat` | up | Status. Receives time, update offers and flags |
| `PUT` | `/sync/v1/backups/:name` | up | Upload a database backup |
| `GET` | `/sync/v1/backups/latest` | down | Download the latest backup (used when replacing a dead server) |

### 13.2 Request signing

Every request except `/activate` carries:

| Header | Value |
|---|---|
| `X-Key-Id` | Key ID issued at activation |
| `X-Timestamp` | Unix time in seconds |
| `X-Nonce` | 16 random bytes, base64url |
| `X-Sync-Protocol` | `1` |
| `X-Device-Version` | Software version, for example `1.0.3` |
| `X-Signature` | Lowercase hex of `HMAC-SHA256(secret, string_to_sign)` |

```
string_to_sign =
  "v1\n" + METHOD + "\n" + path_and_query + "\n" + timestamp + "\n" + nonce + "\n" + sha256_hex(body_bytes_on_the_wire)
```

`body_bytes_on_the_wire` is the body after any gzip compression. For requests with no body it is the SHA-256 of the empty string.

The cloud:

1. Looks up the device by `X-Key-Id`. Revoked returns `403 DEVICE_REVOKED`.
2. Rejects `|now − timestamp| > 300 s` with `401 CLOCK_SKEW` and `server_time` in the body.
3. Rejects a nonce seen in the last 10 minutes (kept in Redis with a TTL) with `401 SIGNATURE_INVALID`.
4. Recomputes the signature and compares in constant time.

Every response includes `X-Server-Time` (Unix seconds). The school server uses it to compute its clock offset and warns on the console if the offset exceeds 2 minutes.

Transport is TLS. Bodies may be gzip compressed (`Content-Encoding: gzip`).

### 13.3 `POST /sync/v1/activate`

No signature. The activation code (from section 12.2) is the credential.

```json
// request
{
  "activation_code": "K7M2-9QXD-4TWH",
  "device_name": "Lab server",
  "software_version": "1.0.0",
  "platform": { "os": "windows", "os_version": "10.0.19045", "arch": "x64" },
  "machine_id_hash": "9f2c..."          // SHA-256 of the Windows MachineGuid, to spot a cloned install
}
```

```json
// 200 (shown once)
{
  "device_id": "0192...",
  "key_id": "k_01J...",
  "secret": "base64-32-bytes",
  "school": { "id": "0192...", "code": "GRA", "name": "Graceland College", "timezone": "Africa/Lagos" },
  "cloud_signing_key": { "key_id": "ps-2026-1", "alg": "Ed25519", "public_key": "base64..." },
  "initial_cursor": 0,
  "sync_interval_seconds": 300,
  "restore_available": false
}
```

Errors: `ACTIVATION_CODE_INVALID` (404), `ACTIVATION_CODE_EXPIRED` (410), `ACTIVATION_CODE_USED` (410). A code is valid once. The school server stores `secret` protected by Windows DPAPI at machine scope. If the code had `replaces_device_id`, the old device is revoked and `restore_available` is `true` when a backup exists.

### 13.4 `GET /sync/v1/changes?since=<cursor>&limit=500`

```json
{
  "cursor": 1842,
  "has_more": false,
  "changes": [
    { "cursor": 1840, "entity": "student", "op": "upsert", "id": "0192...",
      "data": { "id": "0192...", "code": "GRA-K7M2P9QXW", "code_status": "active",
                "full_name": "Tunde Bello", "class_id": "0192...", "status": "active" } },
    { "cursor": 1841, "entity": "sitting", "op": "upsert", "id": "0192...",
      "data": { "id": "0192...", "exam_id": "0192...", "class_id": "0192...",
                "window_start": "2026-10-20T08:00:00.000Z", "window_end": "2026-10-20T10:00:00.000Z",
                "status": "scheduled" } },
    { "cursor": 1842, "entity": "pack", "op": "upsert", "id": "0192...",
      "data": { "id": "0192...", "exam_id": "0192...", "version": 2, "key_version": 1,
                "sha256": "ab12...", "size_bytes": 4213377, "status": "ready" } }
  ]
}
```

Entities and their `data`:

| Entity | `data` fields | Goes into |
|---|---|---|
| `class` | `id`, `name`, `section` | `classes` |
| `subject` | `id`, `name` | `subjects` |
| `student` | `id`, `code`, `code_status`, `full_name`, `class_id`, `status` | `students` |
| `exam` | `id`, `title`, `subject_id`, `duration_min`, `settings` (`shuffle_questions`, `shuffle_options`, `show_score_to_student`) | `exams` |
| `sitting` | `id`, `exam_id`, `class_id`, `window_start`, `window_end`, `status` (`scheduled` or `cancelled`) | `sittings` (scheduling fields only) |
| `pack` | `id`, `exam_id`, `version`, `key_version`, `sha256`, `size_bytes`, `status` (`ready` or `superseded`) | `packs` |
| `setting` | `key`, `value` (only `strict_seats` and `school_name` in the MVP) | `meta` |

Rules:

- The feed never contains guardians, users, parents' contact details, fees, or anything the exam server does not need (BR-24).
- The cloud writes a `change_log` row for every relevant change in the same transaction.
- `op: delete` removes the row locally unless sessions refer to it, in which case it is marked inactive.
- The school server applies a page in one transaction and stores the new cursor in the same transaction (`sync_state.last_cursor`). If a request fails the next one starts from the stored cursor.
- A `student` change with `code_status: revoked` takes effect on the next login attempt.
- A `sitting` change that moves the times is applied unless the sitting is already `open` locally. The console shows a notice in that case.

### 13.5 `GET /sync/v1/packs/:pack_id`

Returns the pack file as `application/octet-stream`. Supports `Range` and `If-Range` so an interrupted download resumes (US-8.4). Headers: `ETag: "<sha256>"`, `X-Pack-Sha256`, `X-Pack-Size`. The server verifies the hash and signature before marking `packs.verified = 1` (section 14.4).

### 13.6 `GET /sync/v1/packs/:pack_id/key`

```json
{
  "pack_id": "0192...", "key_version": 1,
  "wrapped_key": { "alg": "AES-256-GCM", "nonce": "base64...", "ciphertext": "base64..." },
  "kdf": { "alg": "HKDF-SHA256", "salt": "<pack_id>", "info": "cbt-pack-key-v1" }
}
```

The wrapping key is derived from the device secret, so only this server can unwrap it (section 14.3).

### 13.7 `POST /sync/v1/results`

```json
// request
{
  "batch_id": "0192...",
  "events": [
    { "event_id": "0192...", "type": "session.submitted", "occurred_at": "2026-10-20T09:41:12.000Z",
      "payload": { } }
  ]
}
```

Limits: 100 events or 5 MB uncompressed per batch. Events must be in creation order.

```json
// 200
{
  "results": [
    { "event_id": "0192...", "outcome": "accepted" },
    { "event_id": "0192...", "outcome": "duplicate" },
    { "event_id": "0192...", "outcome": "rejected", "code": "STUDENT_UNKNOWN", "message": "Student is not in this school" }
  ]
}
```

| Outcome | What the school server does |
|---|---|
| `accepted` | Marks the outbox row `acked_at` |
| `duplicate` | Same as accepted (the cloud already has it) |
| `rejected` | Stores `rejected` with the code. Does not retry. Shows it in the console and reports it in the heartbeat |

A network failure or a `5xx` is retried with exponential backoff (30 s, 1 min, 2 min, 5 min, then every 5 min). Rows are never deleted until acknowledged. Processing a batch is idempotent: `sync_events` has the primary key `(device_id, event_id)` (data model 2.9), and a replay returns `duplicate`.

Rejection codes: `STUDENT_UNKNOWN`, `SITTING_UNKNOWN`, `EXAM_UNKNOWN`, `PACK_UNKNOWN`, `PAYLOAD_INVALID`, `EVENT_TYPE_UNKNOWN`, `SCHOOL_MISMATCH`.

### 13.8 `POST /sync/v1/heartbeat`

```json
// request (every 5 minutes when online, and after each sitting closes)
{
  "software_version": "1.0.3",
  "os_version": "10.0.19045",
  "uptime_seconds": 86400,
  "cursor": 1842,
  "packs": [ { "pack_id": "0192...", "exam_id": "0192...", "version": 2, "verified": true } ],
  "outbox": { "pending": 0, "rejected": 0, "oldest_pending_at": null },
  "last_backup_at": "2026-10-19T22:00:00.000Z",
  "last_backup_ok": true,
  "disk_free_mb": 41230,
  "db_size_mb": 38,
  "clock_offset_ms": -820,
  "open_sittings": [ "0192..." ]
}
```

```json
// 200
{
  "server_time": "2026-10-19T08:15:00.000Z",
  "update": { "version": "1.0.4", "download_url": "https://.../SchoolCBT-Setup-1.0.4.exe",
              "sha256": "cd34...", "min_supported": "1.0.0", "notes": "Fixes ..." },
  "flags": { "revoke": false },
  "pin_reset_pending": false
}
```

`update` is present only when a newer release exists on the school's channel. The server downloads and verifies it, but installs only between sittings (US-15.6, section 17.5 of the console API: updates are blocked while a sitting is open). The cloud derives the "pack ready on the school server" state (data model 2.7) from `packs[]`.

### 13.9 Backups

`PUT /sync/v1/backups/:name`: streams the SQLite backup file (created with the SQLite backup API or `VACUUM INTO`), optionally gzip compressed. `:name` is `school-YYYYMMDD-HHmmss.db.gz`. The cloud stores it in object storage with encryption at rest, keeps the latest 30, and answers `204`.

`GET /sync/v1/backups/latest`: used when a replacement server activates with a code that has `replaces_device_id` set. Returns the most recent backup and its checksum in `X-Backup-Sha256`. After restoring, the new server runs `changes?since=0` to refresh the roster and packs, then uploads any sessions that were in the backup but not yet acknowledged through the normal outbox (the restored outbox is replayed, and duplicates are harmless).

The backup contains student names, classes, codes and answers. It travels over TLS and is encrypted at rest in the cloud. It never contains guardian data.

---

## 14. Pack format, answer keys and marking

### 14.1 What a pack is

A pack is a single file, `pack-<exam_id>-v<version>.cbtpack`, which is a ZIP archive. One pack serves every school server of the school. It is built by a cloud background job when an exam is published (section 8.2).

```
pack-<exam_id>-v2.cbtpack
├── manifest.json        facts about the pack, file list with hashes
├── questions.json       the questions students see (no answer keys)
├── keys.enc             answer keys and marking rules, encrypted
├── assets/
│   ├── 0192abc....png   images used in questions
│   └── ...
└── signature.json       cloud signature over the manifest
```

### 14.2 `manifest.json`

Written as canonical JSON (RFC 8785, keys sorted, no extra spaces) so the signature is stable.

```json
{
  "format_version": 1,
  "pack_id": "0192...",
  "school_id": "0192...",
  "exam_id": "0192...",
  "version": 2,
  "key_version": 1,
  "built_at": "2026-10-18T14:02:11.000Z",
  "exam": {
    "title": "JSS 2 Mathematics, First Term Exam",
    "subject": { "id": "0192...", "name": "Mathematics" },
    "section": "secondary",
    "duration_min": 60,
    "instructions_html": "<p>Answer all questions.</p>",
    "shuffle_questions": true,
    "shuffle_options": true,
    "show_score_to_student": false,
    "question_count": 40,
    "total_marks": 40
  },
  "files": [
    { "path": "questions.json", "sha256": "…", "bytes": 38211 },
    { "path": "keys.enc",       "sha256": "…", "bytes": 4120 },
    { "path": "assets/0192abc.png", "sha256": "…", "bytes": 55102 }
  ],
  "keys": {
    "alg": "AES-256-GCM",
    "file": "keys.enc",
    "nonce": "base64...",
    "aad": "pack_id|version|key_version"
  }
}
```

`exam.section` is `primary`, `secondary` or `mixed` and decides which exam screen loads when classes of both kinds are targeted (the class's own section wins in `mixed`).

### 14.3 `questions.json`

```json
[
  {
    "question_id": "0192...", "question_version": 1, "position": 1,
    "type": "single_choice",
    "stem": "<p>What is $2^3$?</p>",
    "options": [
      { "id": "0192...", "label": "A", "body": "6" },
      { "id": "0192...", "label": "B", "body": "8" }
    ],
    "marks": 1,
    "asset_ids": []
  }
]
```

There is no `is_correct`, no `fill_answers` and no explanation here. `true_false` questions carry two options, "True" and "False". `fill_blank` questions carry no options.

`keys.enc` is the AES-256-GCM encryption of this JSON, with the manifest's `nonce` and `aad`:

```json
{
  "0192...": { "type": "single_choice", "marks": 1, "correct_option_ids": ["0192..."] },
  "0192...": { "type": "multi_choice", "marks": 2, "correct_option_ids": ["0192...", "0192..."] },
  "0192...": { "type": "fill_blank",   "marks": 1, "fill": { "answers": ["Abuja"], "case_sensitive": false } }
}
```

The AES key for `keys.enc` is a random 32-byte **pack key**. It is **not** inside the pack. A school server fetches it from `GET /sync/v1/packs/:pack_id/key`, wrapped for that server:

```
KEK        = HKDF-SHA256(ikm = device_secret, salt = pack_id, info = "cbt-pack-key-v1", length = 32)
wrapped    = AES-256-GCM(KEK, nonce, pack_key, aad = pack_id)
```

So the pack file itself is identical for everyone, can be copied around, and is useless without a registered device's key. For a USB load the key file is generated for the chosen device (section 18.2).

**Security limit.** A person with full administrator rights on the lab PC could extract the device secret and decrypt keys. This is accepted for the MVP. The mitigation is that nobody uses the server PC for anything else, and the Windows account is locked down (Technical Design 13). A later option is `key_release = on_open`, where the key is only delivered when the sitting opens and the server is online.

### 14.4 `signature.json` and verification

```json
{ "alg": "Ed25519", "key_id": "ps-2026-1", "signature": "base64..." }
```

The signature is over `SHA-256(manifest.json bytes)`. The school server verifies, in this order, and refuses the pack on the first failure:

1. `format_version` is known.
2. The `signature` is valid against the cloud public key stored at activation.
3. Every file listed in `files[]` exists and its SHA-256 matches.
4. `school_id` equals this school.
5. The pack key unwraps and `keys.enc` decrypts, and the key list contains every `question_id` in `questions.json`.

Then `packs.verified = 1`. The console shows each failed step in plain words (US-8.5).

### 14.5 Marking rules (the `exam-core` package)

The same code scores answers on the school server and in the cloud (US-11.1). It must be a pure function: `mark(question_key, answer) → marks`.

| Type | Answer shape (from the client) | Marks |
|---|---|---|
| `single_choice` | `{ "option_id": "..." }` | Full marks if `option_id` is the correct one, else 0 |
| `true_false` | `{ "option_id": "..." }` | As single choice |
| `multi_choice` | `{ "option_ids": ["...", "..."] }` | Full marks only if the set equals the correct set exactly, else 0 (BR-13). No partial credit |
| `fill_blank` | `{ "text": "Abuja" }` | Full marks if the normalised text equals any normalised accepted answer, else 0 |
| any, unanswered | `null` | 0 |

Normalisation for `fill_blank`: Unicode NFKC, trim, collapse runs of whitespace to one space, then lowercase unless `case_sensitive` is true. No other transformation (no punctuation stripping, no numeric equivalence) in the MVP.

Other rules: no negative marking (BR-13). Marks per question come from the pack (the exam's mark override already applied). `score` is the sum, `max_score` the sum of all marks, `percent = round_half_up(score / max_score × 100, 2)`. The grade comes from the school's grade scale and is computed only in the cloud.

An answer for a question ID that is not in the pack is ignored and logged.

### 14.6 Shuffling

Shuffling is deterministic from the session `seed` (an unsigned 32-bit integer stored on the session), so a resume shows the same order:

1. PRNG: `mulberry32(seed)`.
2. If `shuffle_questions`, Fisher-Yates over the question list using the PRNG.
3. For each question with `shuffle_options` on, Fisher-Yates over its options, using `mulberry32(seed XOR hash32(question_id))`. `true_false` options are never shuffled (True, then False).
4. Labels shown to the student (A, B, C ...) are assigned after shuffling. Answers are always stored by `option_id`, never by label.

The shuffle function lives in `exam-core` and is used by the exam client and the console preview.

---

## 15. Sync event payloads

Every event in `POST /sync/v1/results` has the envelope `{ event_id, type, occurred_at, payload }`. `event_id` is a UUIDv7 made on the school server when the row is written to `outbox`, in the same transaction as the data change.

| Type | When written | Payload |
|---|---|---|
| `sitting.opened` | Invigilator opens a sitting | `sitting_id`, `opened_at`, `exam_key_hash` (SHA-256 of the key plus the sitting ID), `pack_version` |
| `session.started` | Student presses Start | `session_id`, `sitting_id`, `exam_id`, `student_id`, `pack_version`, `seat`, `started_at`, `ends_at` |
| `session.submitted` | Session ends by submit, timeout, invigilator close or window close | see below |
| `session.scored` | Marking finished (same transaction as `submitted`) | `session_id`, `score`, `max_score`, `key_version`, `per_question: [ { question_id, marks } ]`, `scored_at` |
| `session.reset` | Invigilator resets a session | `session_id`, `sitting_id`, `student_id`, `reason`, `kept_answers`, `reset_at` |
| `sitting.closed` | Sitting closed | `sitting_id`, `closed_at`, `counts: { started, submitted, in_progress_at_close }` |

`session.submitted` payload:

```json
{
  "session_id": "0192...",
  "sitting_id": "0192...",
  "exam_id": "0192...",
  "student_id": "0192...",
  "pack_version": 2,
  "seat": "PC-12",
  "started_at": "2026-10-20T08:03:10.000Z",
  "submitted_at": "2026-10-20T08:58:44.000Z",
  "submit_reason": "student",            // student | time_up | invigilator | window_closed
  "extra_seconds": 0,
  "answers": [
    { "question_id": "0192...", "answer": { "option_id": "0192..." }, "flagged": false, "seq": 41, "answered_at": "2026-10-20T08:12:01.000Z" }
  ],
  "integrity": { "focus_lost_count": 2 }
}
```

Autosave updates are not sent. Only the final answers and scores are.

### 15.1 What the cloud does on receipt

| Event | Cloud action |
|---|---|
| `sitting.opened` | Sets `sittings.status = open`, `opened_at` |
| `session.started` | Creates the `submissions` row early (without answers) so the admin sees who started |
| `session.submitted` | Creates or completes the submission and its `submission_answers`. Re-marks every answer with `exam-core` and stores `cloud_marks` |
| `session.scored` | Stores `school_score`. If `school_score` differs from the cloud's own total for the same `key_version`, writes audit `score_mismatch` and keeps the **cloud** score on the result |
| `session.reset` | If a submission exists it becomes `voided`. The matching result is removed from review lists |
| `sitting.closed` | Sets `sittings.status = closed`, `closed_at` |

The result row is created as `draft` once both `submitted` and `scored` are in. Events for one session may arrive in any order within a batch. The cloud buffers an event for a session it has not seen yet for up to 24 hours before rejecting it with `SESSION_UNKNOWN`.

---

## 16. School Exam API (student client)

Base `http://<server-ip>:8080/api/v1/exam`. Used only by the exam client in a browser on a lab PC. Plain HTTP on the isolated lab network. Covers Epic 10.

### 16.1 Tokens

- `POST /login` returns a **ticket**: an HMAC-signed token (claims: `student_id`, `sitting_id`, `seat`, expiry 15 minutes) that can only call `/start`. It is stateless, so no database row exists until the student presses Start (US-10.2).
- `POST /start` creates the session row and returns the **session token**. Only its SHA-256 is stored (`sessions.token_hash`).
- If a student logs in again while a session is live, the server issues a new session token and the old one stops working. That is how a student moves to another PC (US-9.8) and how a frozen PC is recovered (US-10.7).

### 16.2 `GET /status`

Public, no token. For the login screen.

```json
{
  "school_name": "Graceland College",
  "server_time": "2026-10-20T07:55:00.000Z",
  "open_sittings": 2,
  "seat": "PC-12"
}
```

It never lists student or exam names.

### 16.3 `POST /login`

```json
// request
{ "student_code": "GRA-K7M2P9QXW", "exam_key": "482913", "seat": "PC-12" }
```

Server steps: normalise the code (uppercase, trim, strip spaces and the hyphen, map `0 O` and `1 I L` to nothing because they are not in the alphabet, which makes them format errors), verify the check character (`CODE_FORMAT_INVALID` before any lookup), look up the student, check the code is active, find the open sitting whose key matches, check the student belongs to the sitting's class, check no live session elsewhere or hold the seat check, then answer.

```json
// 200, not started yet
{
  "ticket": "eyJ...",
  "state": "ready",
  "student": { "full_name": "Tunde Bello", "class_name": "JSS 2 Gold", "section": "secondary" },
  "exam": {
    "title": "Mathematics, First Term Exam", "subject": "Mathematics",
    "duration_min": 60, "question_count": 40,
    "instructions_html": "<p>Answer all questions.</p>",
    "show_score_to_student": false
  }
}
```

```json
// 200, session already live (resume)
{
  "state": "in_progress",
  "session_token": "…",
  "student": { ... }, "exam": { ... },
  "remaining_ms": 2160000,
  "ends_at": "2026-10-20T09:10:00.000Z",
  "seq": 41
}
```

For a resume the client then calls `GET /session` to get the questions and saved answers.

Errors are in section 2. Failures count per seat, and the fifth in a minute returns `SEAT_LOCKED` (US-10.1). A failure never says which part (code or key) was wrong beyond the specific messages in section 2.

### 16.4 `POST /start`

Header `Authorization: Bearer <ticket>`. Empty body.

Creates the session: `seed` random, `started_at` now, `ends_at = min(now + duration + extra, window_end)`. Writes `session.started` to the outbox in the same transaction.

```json
// 200
{
  "session_token": "…",
  "session_id": "0192...",
  "started_at": "2026-10-20T08:03:10.000Z",
  "ends_at": "2026-10-20T09:03:10.000Z",
  "remaining_ms": 3600000,
  "seq": 0,
  "questions": [ /* shuffled per the seed, as in questions.json, with shuffled options */ ],
  "assets_base": "/api/v1/exam/assets/"
}
```

`ALREADY_SUBMITTED` if the student already has a submitted session for this exam (BR-10).

### 16.5 `GET /session`

Header `Authorization: Bearer <session_token>`. Returns the same `questions` plus saved `answers`:

```json
{
  "session_id": "0192...", "status": "in_progress",
  "ends_at": "2026-10-20T09:03:10.000Z", "remaining_ms": 2160000, "server_time": "2026-10-20T08:27:10.000Z",
  "seq": 41,
  "questions": [ ... ],
  "answers": [ { "question_id": "0192...", "answer": { "option_id": "0192..." }, "flagged": false } ]
}
```

### 16.6 `PUT /session/answers`

```json
// request: sent within about 2 seconds of a change, batched
{
  "seq": 42,
  "changes": [
    { "question_id": "0192...", "answer": { "option_id": "0192..." }, "flagged": false },
    { "question_id": "0192...", "answer": null, "flagged": true }
  ]
}
```

```json
// 200
{
  "ack_seq": 42,
  "saved_at": "2026-10-20T08:28:01.000Z",
  "server_time": "2026-10-20T08:28:01.000Z",
  "remaining_ms": 2111000,
  "ends_at": "2026-10-20T09:03:10.000Z",
  "status": "in_progress"
}
```

Rules:

- `seq` is a counter the client increments per batch and keeps in the browser buffer. The server upserts each answer only if `seq` is greater than the stored one, and answers with the highest it has (`ack_seq`). A repeated batch is harmless (idempotent).
- `ends_at` in the reply reflects any extra time the invigilator added, so the new end time reaches the screen within one save cycle (US-9.5).
- If the session is already submitted or timed out: `409 SESSION_CLOSED` with `{ "status": "submitted" | "expired" }`. The client shows the finished screen.
- The write is committed (`synchronous = FULL`) before the reply, so an acknowledged answer survives a power cut.
- Answers for unknown question IDs are dropped.

### 16.7 `POST /ping`

Every 15 seconds if nothing else was sent. Empty body. Returns `{ "remaining_ms", "ends_at", "server_time", "status" }`. This is also how the console sees a seat as online.

### 16.8 `POST /session/submit`

```json
// request
{ "seq": 43, "changes": [ ] }      // optional last changes, same shape as PUT answers
```

In one transaction: store the changes, set `status = submitted`, `submit_reason = student`, mark with `exam-core`, store the result, write `session.submitted` and `session.scored` to the outbox.

```json
// 200
{ "status": "submitted", "submitted_at": "2026-10-20T08:58:44.000Z", "score": null }
```

`score` is `{ "score": 34, "max_score": 40, "percent": 85 }` only when `show_score_to_student` is true for the exam (US-10.10). After submission every write returns `SESSION_CLOSED`.

### 16.9 Server-side expiry

A timer on the server (every 5 seconds) finds sessions where `ends_at <= now` and still `in_progress`, and submits them with `submit_reason = time_up`, using the last saved answers. This also covers a dead PC. When a sitting passes its `window_end` any open session is submitted with `window_closed`.

### 16.10 `GET /assets/:asset_id` and `POST /events`

`GET /assets/:asset_id` serves a pack image with `Cache-Control: private, max-age=86400`. Needs the session token. Only assets listed in the session's pack are served.

`POST /events` (optional integrity signals): `{ "type": "focus_lost" | "focus_regained", "at": "..." }` returns `204`. The server increments `focus_lost_count` and writes `session_events`. These are shown to teachers and never used automatically to penalise (Technical Design 8.6).

---

## 17. School Console API and live updates

Base `http://<server-ip>:8080/api/v1/console`. The invigilator console is a web page at `/console` on the same server. Covers Epic 9 and Epic 15 on the school side.

### 17.1 Sign-in

`POST /login`:

```json
{ "pin": "482913", "label": "Mr Danjuma" }
```

`label` is an optional name recorded in the audit log. Returns `{ "token", "expires_in": 28800 }` (8 hours). Five wrong PINs lock the console for five minutes: `423 CONSOLE_LOCKED` with `retry_after` (BR-20). The PIN is six digits, stored as an argon2id hash in `meta.console_pin_hash`.

`POST /pin/change` (`{ "old_pin", "new_pin" }`) and `POST /pin/reset` (`{ "reset_code", "new_pin" }`, code from section 12.2, verified offline) manage the PIN. Both are written to the audit log.

### 17.2 Overview and readiness

`GET /overview`:

```json
{
  "server": { "version": "1.0.3", "time": "2026-10-19T08:15:00.000Z", "clock_ok": true,
              "disk_free_mb": 41230, "db_size_mb": 38, "uptime_seconds": 86400,
              "last_backup_at": "2026-10-18T22:00:00.000Z" },
  "sync":   { "last_sync_at": "2026-10-19T08:10:00.000Z", "last_error": null,
              "outbox_pending": 0, "outbox_rejected": 0, "online": true },
  "sittings": [
    {
      "id": "0192...", "exam_title": "Mathematics, First Term Exam", "class_name": "JSS 2 Gold",
      "window_start": "2026-10-20T08:00:00.000Z", "window_end": "2026-10-20T10:00:00.000Z",
      "status": "scheduled",
      "readiness": {
        "ready": false,
        "checks": [
          { "id": "pack_present",  "ok": true,  "message": "Exam pack version 2 is loaded." },
          { "id": "pack_verified", "ok": true,  "message": "Pack signature and files are correct." },
          { "id": "roster_current","ok": false, "message": "3 students in this class have no code yet.", "action": "Connect to the internet and press Sync now." },
          { "id": "disk_free",     "ok": true,  "message": "41 GB free." },
          { "id": "clock_sane",    "ok": true,  "message": "The PC clock matches the cloud." },
          { "id": "backup_recent", "ok": true,  "message": "Last backup 10 hours ago." }
        ]
      }
    }
  ]
}
```

Readiness checks (US-8.5): `pack_present` (the latest version announced for the exam is on disk), `pack_verified` (section 14.4 passed), `roster_current` (every student of the class is present with an active code and the last sync is not older than 7 days), `disk_free` (at least 5 GB), `clock_sane` (offset under 2 minutes at the last sync, or the PC was synced within 24 hours), `backup_recent` (under 48 hours), `window_valid` (the window has not passed). Every message is plain English with an action when it fails.

### 17.3 Sittings, seats and sessions

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/sittings/:id` | Detail: readiness, key state, counts |
| `POST` | `/sittings/:id/open` | Open (US-9.2). Body `{ "override": { "reason": "..." } }` only if not ready. Returns `{ "exam_key": "482913", "opened_at" }`. The key is shown only here and on `GET /sittings/:id` while open |
| `POST` | `/sittings/:id/close` | Close (US-9.7). Body `{ "confirm": true }`. Submits and marks every open session. Returns `{ "submitted": 28, "was_in_progress": 2 }` |
| `POST` | `/sittings/:id/key/regenerate` | New key if one leaks. Live sessions are unaffected. Body `{ "reason" }` |
| `GET` | `/sittings/:id/sessions` | Live list: `student`, `seat`, `status`, `answered`, `total`, `last_saved_at`, `online`, `extra_seconds` (US-9.3) |
| `POST` | `/sittings/:id/seats` | Assign seats: `{ "assignments": [ { "student_id", "seat" } ] }` (US-9.4) |
| `POST` | `/sittings/:id/extra-time` | Whole room: `{ "minutes": 10, "reason": "Power cut" }` (US-9.5) |
| `POST` | `/sessions/:id/extra-time` | One student: `{ "minutes": 5, "reason": "Started late" }` |
| `POST` | `/sessions/:id/reset` | `{ "reason", "keep_answers": true }` (US-9.6). Old session becomes `reset`. If `keep_answers` is false the answers are discarded and the student starts afresh |
| `POST` | `/sessions/:id/release-seat` | Allow the student to continue on another PC now (US-9.8) |
| `GET` | `/sessions/:id` | One session with `session_events` |

Opening a sitting writes `sitting.opened`. Closing writes `sitting.closed` and, per session, `session.submitted` and `session.scored`. Every action here writes to `audit_log` with the PIN label and reason.

The exam key is six random digits, avoiding a value already used by another open sitting, generated by a CSPRNG (BR-09). Only a salted SHA-256 of the key is stored. The plain key is held in memory while the sitting is open and shown to the console.

### 17.4 Sync, backup, packs, health

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/sync/now` | Run a sync immediately (US-15.2). Returns `202`. Progress arrives on the WebSocket |
| `GET` | `/sync/status` | `last_sync_at`, `last_error`, `outbox: { pending, rejected, rejected_items }` |
| `POST` | `/backup/now` | Take a backup now |
| `GET` | `/backups` | List backups with size and checksum |
| `POST` | `/outbox/export` | Build a `.cbtsync` file of unsent events and stream it as a download (section 18.1, US-15.3) |
| `POST` | `/packs/import` | `multipart`: `pack` (`.cbtpack`) and `key` (`.cbtkey`). Verifies as in 14.4 (US-8.6) |
| `GET` | `/health` | Disk, clock, backup, database integrity check result, version |
| `GET` | `/audit?limit=200&cursor=` | The local audit log |

### 17.5 Updates

The server downloads an update offered by the heartbeat and checks its SHA-256. It installs only when no sitting is `open` and none is due within the next 2 hours. The console `POST /updates/apply` lets the invigilator choose the moment. The installer takes a backup, replaces the files, runs migrations, and rolls back automatically if the service does not report healthy within 60 seconds (US-15.6). The console refuses `POST /updates/apply` with `409 CONFLICT` while a sitting is open.

### 17.6 WebSocket `/ws/console?token=<token>`

Server to client messages (JSON, one per frame, coalesced to at most one per second per type), so the progress view updates within 3 seconds (US-9.3):

```json
{ "type": "sitting.sessions", "sitting_id": "0192...", "changed": [ { "session_id": "0192...", "seat": "PC-12", "status": "in_progress", "answered": 22, "last_saved_at": "...", "online": true } ] }
{ "type": "sync.status", "last_sync_at": "...", "outbox_pending": 3, "online": true }
{ "type": "health.warning", "id": "disk_low", "message": "Free disk space is under 5 GB." }
{ "type": "sitting.state", "sitting_id": "0192...", "status": "open" }
```

Client to server: `{ "type": "subscribe", "sitting_id": "0192..." }` and `{ "type": "ping" }`. A seat counts as offline when the server has not heard from it (answers or ping) for 30 seconds (US-9.3).

---

## 18. USB fallback files

For a school with no internet at the time it needs to move data (US-15.3, US-8.6, Technical Design 9.11).

### 18.1 Results export: `.cbtsync`

Made by `POST /console/outbox/export`. A ZIP archive:

```
results-<school_code>-<yyyymmdd-hhmm>.cbtsync
├── manifest.json
├── events.ndjson       one event envelope per line, the same objects as section 15
└── signature.json
```

```json
// manifest.json
{
  "format_version": 1, "school_id": "0192...", "device_id": "0192...", "key_id": "k_01J...",
  "exported_at": "2026-10-20T11:00:00.000Z", "event_count": 62,
  "first_event_id": "0192...", "last_event_id": "0192...",
  "events_sha256": "…"
}
```

```json
// signature.json
{ "alg": "HMAC-SHA256", "key_id": "k_01J...", "signature": "hex of HMAC(secret, canonical manifest + events_sha256)" }
```

A School Admin or the Platform Owner uploads it with `POST /sync-imports` (section 12.2). The cloud verifies the signature with that device's secret, then processes the events exactly as in 13.7, with the same idempotency. The response is the same `results[]` list. Exported events stay in the outbox until the cloud later acknowledges them, so exporting and later syncing online are both safe.

### 18.2 Pack for USB: `.cbtpack` and `.cbtkey`

`GET /exams/:id/packs/:version/usb?device_id=<id>` returns a ZIP:

```
usb-pack-<exam_id>-v2.zip
├── pack-<exam_id>-v2.cbtpack     the pack, section 14
└── pack-<exam_id>-v2.cbtkey      JSON: the pack key wrapped for the chosen device, plus pack_id and key_version
```

The invigilator copies both files to the server PC and uses `POST /console/packs/import`. The console verifies the pack (14.4). A pack for a different school or an unknown device cannot be unwrapped.

### 18.3 Moving a roster by USB

Not supported in the MVP. A new or replacement server needs internet once, at activation, to receive its roster and cloud public key. After that it can run exams offline indefinitely.

---

## 19. Permissions summary

`A` allowed, `s` allowed within scope, `–` not allowed. Scope rules: Teacher is limited to assigned classes and subjects (BR-19). Class Teacher adds their own class. Parent is limited to linked children with `can_view_results`, and released results (BR-05, BR-06, BR-14). Invigilator exists only on the school server.

| Area | Platform Owner | School Admin | Teacher | Parent | Student | Invigilator |
|---|---|---|---|---|---|---|
| Sign in, own account (3) | A | A | A | A | – | – |
| Invitations (4.2) | first admin | A | – | – | – | – |
| Claim an invite (4.1) | public | public | public | public | – | – |
| Teachers and admins (5.1) | – | A | read self | – | – | – |
| Guardians (5.2) | – | A | – | self via 10 | – | – |
| Students (5.3) | – | A | s (read) | linked via 10 | – | – |
| Academic structure (6) | – | A | s (read) | – | – | – |
| Question bank and imports (7) | – | A | s | – | – | – |
| Exams, sittings, packs (8) | read | A | s | – | – | – |
| Results: view, review (9) | – | A | s | – | – | – |
| Results: release (9.2) | – | A | s (Class Teacher, if `release_policy`) | – | – | – |
| Key correction (9.3) | – | A | s | – | – | – |
| Parent portal (10) | – | – | – | A | – | – |
| Dashboards, settings, audit (11) | audit | A | teacher dashboard | – | – | – |
| Platform and devices (12) | A | school devices | – | – | – | – |
| Sync API (13) | – | – | – | – | – | school server only |
| School Exam API (16) | – | – | – | – | A | – |
| School Console API (17) | – | – | – | – | – | A |

The automated permission test described in Technical Design 4.3 builds its cases from this table, one request per role and endpoint.

---

## 20. Limits and defaults

| Item | Value |
|---|---|
| Staff session | 12 hours |
| Parent session | 30 days, sliding |
| Invitation expiry | Staff 7 days, guardian 14 days (BR-03) |
| One-time code | 6 digits, valid 10 minutes, 5 attempts, resend after 60 seconds |
| Activation code | Valid 72 hours, once |
| Console PIN | 6 digits, 5 wrong tries lock 5 minutes |
| Exam key | 6 digits, per sitting |
| Sign-in lockout | 5 failures, 15 minutes |
| Import file | 10 MB, 200 questions per question file, 5,000 rows for people files |
| Question image | 2 MB upload, resized to 1200 px wide, converted to web size |
| Pack size target | Under 25 MB per pack. The build warns above that |
| Answer autosave | Within 2 seconds of a change, batched. Ping every 15 seconds |
| Seat offline | No contact for 30 seconds |
| Sync interval | 5 minutes when online. Immediately after a sitting closes |
| Sync batch | 100 events or 5 MB |
| Clock tolerance | Signed requests within 5 minutes. Console warning at 2 minutes |
| Backups | After each sitting and nightly. Keep the last 30 locally and in the cloud |
| Free disk warning | Under 5 GB |
| Freeze | 24 hours before the first sitting (BR-11) |
