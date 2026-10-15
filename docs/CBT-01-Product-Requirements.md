# School CBT Platform: Product Requirements (PRD)

Version 1.0 · 11 October 2026 · Status: draft for review

This document says **what the platform must do** and for whom. It does not say how it is built. For that, read the companion documents:

| Document | Question it answers |
|---|---|
| `CBT-Technical-Design.md` | How is the system built and how do offline and online fit together? |
| **`CBT-01-Product-Requirements.md` (this file)** | **What must it do, for whom, and how do we know it works?** |
| `CBT-02-Data-Model.md` | What does the database hold? |
| `CBT-03-API-and-Sync-Specification.md` | What are the endpoints and the sync protocol? |
| `CBT-04-Build-Specification.md` | What do we tell the coding agent, step by step? |
| `CBT-05-Site-Survey-Checklist.md` | What do we check at the school before quoting and installing? |

The product has no name yet. It is called "the platform".

---

## Contents

1. [Product summary](#1-product-summary)
2. [Goals, success measures and non-goals](#2-goals-success-measures-and-non-goals)
3. [Users](#3-users)
4. [Release scope](#4-release-scope)
5. [How accounts are created](#5-how-accounts-are-created)
6. [Business rules](#6-business-rules)
7. [Epics and user stories](#7-epics-and-user-stories)
8. [Screens by role](#8-screens-by-role)
9. [Reports and exports](#9-reports-and-exports)
10. [Assumptions, dependencies and open questions](#10-assumptions-dependencies-and-open-questions)
11. [MVP acceptance checklist](#11-mvp-acceptance-checklist)

---

## 1. Product summary

A school CBT platform. Teachers prepare exams in the cloud. Students write them in the school's computer lab with no internet needed. The lab's exam server marks objective questions and copies results to the cloud when the internet is available. Teachers review the results and the school releases them. Parents see their children's released results online.

The reference product is J-Card. This platform is narrower (CBT, results and parents, not a full school suite) and aims to be more reliable, easier to use, and better for families with several children.

Four surfaces:

| Surface | Used by | Where |
|---|---|---|
| Admin portal | School Admin | Cloud, in a browser |
| Teacher portal | Teachers | Cloud, in a browser |
| Parent portal | Parents | Cloud, in a browser |
| Exam client and invigilator console | Students, Invigilators | School lab, in a browser, offline |

---

## 2. Goals, success measures and non-goals

### 2.1 Goals

1. Exams run to completion on exam day even if the school's internet is down or the power blips.
2. A teacher can prepare a 40-question objective exam in under 30 minutes, or under 15 minutes from a prepared Word or Excel file.
3. Parents see released results quickly, from their own phone, without visiting the school.
4. One parent login covers every child that parent has in the school.
5. The school can see what is happening: who sat which exam, scores, what is outstanding, and whether the lab server is healthy.

### 2.2 Success measures

| Measure | Target |
|---|---|
| Student answers lost in a normal exam | Zero |
| Exam completed after a forced server restart mid-exam | 100% of sessions resume with saved answers |
| Time from "release" to a parent seeing the result (school server and parent both online) | Under 5 minutes |
| Imported questions needing no fix in the preview (using the template) | Over 90% |
| Teachers who can create their first exam without help after training | Over 80% |
| Parent accounts activated within 14 days of invitation | Over 70% |
| Support visits to the school per term after the first term | Fewer than 2 |

These are targets to aim for. Confirm and adjust them with the school.

### 2.3 Non-goals for the first release

- A full school management suite: attendance, timetables, report cards, payroll.
- Theory or essay marking (planned after launch).
- Camera or screen proctoring.
- A student portal. Students only write exams.
- Running exams over the internet from home.
- Mobile apps. Everything is a web app that works in a phone browser where relevant.
- Multi-language screens. English only, with text kept ready for translation.

---

## 3. Users

| User | Description | Main needs |
|---|---|---|
| **Platform Owner** | You, running the product for many schools | Create schools, watch server health, support |
| **School Admin** | Principal, ICT officer or exams officer | Set up the school, create accounts, schedule exams, release results, see everything |
| **Teacher** | Subject or class teacher, often not very technical | Build exams fast, import from Word or Excel, see class scores |
| **Class Teacher** | A teacher also responsible for one class | Same as Teacher, plus optionally release results for that class |
| **Invigilator** | Teacher or ICT staff supervising the lab | Open a sitting, watch progress, handle problems quickly |
| **Student (secondary)** | Ages roughly 10 to 18 | Log in fast, answer, never lose work |
| **Student (primary)** | Ages roughly 6 to 11 | Large, simple screens, one question at a time |
| **Parent** | Parent or guardian with a smartphone, sometimes no email | Simple sign-in, see all children, trust the numbers |
| **Bursar** (Phase 2) | Fees officer | Fees, receipts, outstanding balances |

---

## 4. Release scope

| Release | Contents |
|---|---|
| **MVP** | Epics 1 to 16 below: school setup, accounts, academic structure, students and guardians, question bank, Word and Excel import, exams and scheduling, school server setup, invigilator console, student exam, marking and results, release and Parent Portal, notifications, dashboards, sync and resilience, audit and privacy |
| **Phase 2** | School fees (Epic 17): payment links per class, partial payments, receipts, reminders |
| **Later** | Theory questions with manual marking, AI question drafts, report cards, attendance, bulk SMS and WhatsApp campaigns, a Windows installer variant for other schools, online exam mode |

Priorities in stories use MoSCoW: **Must** (needed to launch), **Should** (valuable, can slip a little), **Could** (nice to have).

---

## 5. How accounts are created

This is the answer to "how are teacher and parent logins created". The short version: **the school creates every account; nobody signs up on their own.** The system then sends an invitation and the person activates their own account.

### 5.1 Principles

1. **No public sign-up.** Every account starts from a School Admin action (or the Platform Owner for the first admin).
2. **The school supplies the contact.** Every person has a contact on file: email for staff, phone or email for parents.
3. **Invite, then claim.** The system creates the account in an "invited" state with no password. The person claims it through a one-time link and sets their own password. Admins never see or set passwords.
4. **The contact on file is the proof of identity.** A link alone does not activate an account. A one-time code goes to the contact the school registered.
5. **Invitations are single-use and expire.**
6. **Students have no accounts.** They get codes.

### 5.2 Account types and how each is created

| Account | Created by | Sign-in identifier | Activation | Notes |
|---|---|---|---|---|
| School Admin (first) | Platform Owner, when creating the school | Email | Invite link by email, set password, set up authenticator app | Required to have two-step verification |
| School Admin (more) | Existing School Admin | Email | Same | Recommended two-step verification |
| Teacher | School Admin, one at a time or CSV import | Email | Invite link by email, set password | Assigned to classes and subjects after |
| Class Teacher | School Admin sets a flag on a teacher for a class | Same as Teacher | None | Not a separate account |
| Parent | School Admin, when registering a guardian, one at a time or CSV import | Phone number or email | Invite by SMS, WhatsApp, email or printed slip. One-time code to the registered phone or email. Set password | One guardian, many children |
| Student | School Admin, one at a time or CSV import | None. Uses a student code at the exam | A printed code slip | No portal login |
| Invigilator | The console PIN, set when the exam server is activated | PIN on the server console | None | Per-person invigilator accounts are Later |
| Bursar (Phase 2) | School Admin | Email | Same as Teacher | |

### 5.3 Teacher flow

```
School Admin                  System                         Teacher
     │ add teacher (name,        │                                │
     │ email, subjects, classes) │                                │
     ├──────────────────────────►│ create user: status "invited"  │
     │                           │ create invitation (token,      │
     │                           │ expires in 7 days)             │
     │                           ├─── email with invite link ────►│
     │                           │                                │ open link
     │                           │◄──── GET invite (valid?) ──────┤
     │                           │ show name, school, role        │
     │                           │◄── set password, accept terms ─┤
     │                           │ status "active", sign in       │
     │ sees teacher as Active    │                                │
```

- If the email bounces or the teacher has no email access, the admin can **copy the invite link** and send it by WhatsApp. A link shared this way also asks for a one-time code sent to the registered email, so a forwarded link alone cannot activate the account.
- If the teacher forgets to activate, the admin sees the invite as Pending and can resend.
- When a teacher leaves, the admin deactivates the account. Their questions and exams stay. The classes they taught can be reassigned.

### 5.4 Parent flow

A parent is a **guardian** record first and an **account** later. This lets the school register parents in bulk before anyone logs in.

```
School Admin                   System                              Parent
     │ register student(s)       │                                    │
     │ register guardian (name,  │                                    │
     │ phone, email?) and link   │                                    │
     │ to child(ren)             │                                    │
     ├──────────────────────────►│ match existing guardian by phone,  │
     │                           │ then email. Reuse if found.        │
     │                           │ create invitation (14 days)        │
     │                           ├── SMS / WhatsApp / email link ────►│
     │                           │   or printed slip with claim code  │
     │                           │                                    │ open link
     │                           │◄── request code ───────────────────┤
     │                           ├── 6-digit code to REGISTERED phone/│
     │                           │   email (not the one typing)     ─►│
     │                           │◄── code + new password ────────────┤
     │                           │ guardian account "active"          │
     │                           │ parent sees ALL linked children    │
```

Rules for parents:

- **One guardian, many children.** If the school registers "Mrs Adeyemi" for three children, she is one guardian with three links and one login. Matching uses the normalised phone number first, then email. The import screen flags a likely match for the admin to confirm instead of silently merging.
- **Each parent has their own login.** Two parents of the same children each get an account. Logins are not shared.
- **A guardian needs a phone or an email.** Without one, there is nothing to verify. The admin cannot send an invite until one is added.
- **Sign in** with phone number or email, plus the password set at activation. A one-time code is used only to activate, to reset a forgotten password, and to verify a changed contact. This keeps SMS cost low.
- **Contact changes** are made by the admin in the MVP and are logged. A parent who loses their phone number asks the school.
- **Restricting access.** The admin can mark a guardian link "cannot view results" for a child, for example after a custody dispute.
- **The parent never sees a student's exam code.**

### 5.5 Student flow

1. The admin registers the student (or imports a class list).
2. The system generates a student code.
3. The admin prints code slips for a class. A teacher or the exams officer hands them out.
4. The student types the code and the exam key at the lab PC. No account, no password.
5. A lost code is reissued by the admin. The old code stops working.

### 5.6 Invitation states

`pending` (created, not yet sent) → `sent` → `used` (claimed) | `expired` | `revoked` | `failed` (delivery failed).

Admins have an **Invitations** screen showing every invite with its state, channel, last sent time, and actions: resend, revoke, copy link, print slip.

### 5.7 Edge cases

| Situation | Behaviour |
|---|---|
| Invite link opened after it expired | Page says it expired. Admin resends |
| Wrong person opens a forwarded link | They cannot get the code sent to the registered contact, so they cannot claim |
| Parent registered with a phone that has changed | Admin updates the phone and resends. The old number is removed |
| Two children with different parent phone numbers recorded for the same mother | Import flags both as possible duplicates. Admin merges them |
| Parent has children in two classes | One guardian, two links |
| Teacher account created with the wrong email | Admin corrects it while the invite is pending, which revokes the old invite and sends a new one |
| Someone requests a code repeatedly | Resend cooldown of one minute, five wrong attempts lock the code, and a monthly SMS cap per school |
| Teacher or parent forgets their password | "Forgot password" sends a reset link or code to the registered contact |
| Staff member leaves | Deactivated. Existing sessions are revoked immediately |
| Parent no longer has any children at the school | Account kept, with no children shown, until the admin removes it |

### 5.8 Security notes

- Invite tokens and one-time codes are stored hashed, never in plain text.
- Passwords use argon2id. Minimum 10 characters. Common and breached passwords are rejected.
- Failed sign-ins slow down and then lock the account for a short period.
- Sign-in, invitation, code and role changes are written to the audit log.
- Admin accounts should use an authenticator app (TOTP). It is required for the Platform Owner and the first School Admin.

---

## 6. Business rules

These apply everywhere. The data model and API refer to them by number.

| ID | Rule |
|---|---|
| BR-01 | Accounts are created by the school or Platform Owner. There is no public sign-up. |
| BR-02 | A guardian must have a phone number or an email before an invite can be sent. |
| BR-03 | Invitation tokens are single-use. Teachers and admins have 7 days. Parents have 14 days. Both are configurable. A claim needs a one-time code to the registered contact unless the invite was delivered by email to that same registered email. |
| BR-04 | Guardians are matched by normalised phone number (E.164), then by email, within one school. |
| BR-05 | A guardian sees all of their linked children with one login. Guardians do not share logins. |
| BR-06 | A guardian link can be restricted so the guardian cannot view results for that child. |
| BR-07 | A student has no portal login. Exams use a student code. |
| BR-08 | A student code is unique within a school, uses the characters `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, has a check character, and is never reused. |
| BR-09 | An exam key is six digits, generated by the exam server when a sitting opens, and valid for that sitting only. |
| BR-10 | A student has at most one session per sitting, and at most one active session at a time. |
| BR-11 | An exam freezes 24 hours before its sitting. A change after the freeze creates a new pack version that the school server must load. Sessions already started finish on the version they started with. |
| BR-12 | An approved question cannot be edited. "Edit" creates a new version that supersedes the old one. Exams that already use the old one are unaffected unless the teacher swaps it. |
| BR-13 | Marking: single choice and true/false match one option. Multiple choice is all-or-nothing (the selected set must equal the correct set). Fill-in-the-blank matches any accepted answer after trimming spaces and ignoring case, unless the question says case matters. There is no negative marking. Default marks per question: 1. |
| BR-14 | Results start as drafts. Only released results are visible to parents. Releasing needs a School Admin, or a Class Teacher if the school allows it. |
| BR-15 | Re-marking after a key correction creates a new result revision. If the result was already released, parents see the updated score marked "updated" and are notified, unless the school turns that off. |
| BR-16 | A sitting has a start time and a hard close time. A student's time ends at the earlier of start plus duration plus extra time, and the hard close time. An invigilator can add extra time to compensate for a late start. |
| BR-17 | No retakes inside a sitting. Absent students sit a make-up sitting, which is a new sitting of the same exam. |
| BR-18 | The grade scale is per school. Default: A 70 to 100, B 60 to 69, C 50 to 59, D 45 to 49, E 40 to 44, F 0 to 39. The school can change it. |
| BR-19 | Teachers see only the classes and subjects assigned to them. |
| BR-20 | The console PIN is six digits, set at activation. Five wrong attempts lock the console for five minutes. A reset code comes from the cloud. |
| BR-21 | Parent notifications use email by default. SMS and WhatsApp are optional, and are capped per school per month. |
| BR-22 | Data retention is set per school. Default: keep results while the student is enrolled plus two years, and keep detailed sessions for one year. Confirm with legal advice. |
| BR-23 | A student's answer key is never sent to a browser. |
| BR-24 | The school server never holds parent details. |

---

## 7. Epics and user stories

Each story has an ID, a priority and acceptance criteria. A story is done when all its criteria pass.

### Epic 1: Platform and school setup (Platform Owner)

**US-1.1 Create a school** (Must)
As the Platform Owner, I want to create a school, so that it can start using the platform.
- Required: name, short code (3 to 5 letters, unique), state, contact email, timezone (default Africa/Lagos).
- The school code is used as the prefix of student codes.
- A new school starts with default grade scale and settings.

**US-1.2 Invite the first School Admin** (Must)
As the Platform Owner, I want to invite the first admin by email, so that the school can set itself up.
- An invite is sent. The admin must set a password and an authenticator app before first use.
- Details follow section 5.

**US-1.3 Manage the licence** (Should)
As the Platform Owner, I want to set a plan, student cap and expiry, so that billing is controlled.
- When the licence expires, the school is read-only. Exams already loaded on the school server can still run.
- The admin sees a warning 30 days before expiry.

**US-1.4 Create a school server activation code** (Must)
As the Platform Owner or School Admin, I want an activation code, so that the lab PC can connect to this school.
- One code per server, valid 72 hours, used once.
- Using it registers the server and issues its keys.

**US-1.5 Monitor school server health** (Must)
As the Platform Owner, I want a list of all school servers with last heartbeat and problems, so that I can fix issues before exam day.
- Shows software version, last sync, last backup, free disk, clock offset.
- Flags: no heartbeat for 3 days, free disk below 5 GB, backup older than 2 days, clock off by more than 2 minutes.

**US-1.6 Revoke a school server** (Should)
As the Platform Owner, I want to revoke a server's keys, so that a lost or compromised PC cannot sync.
- A revoked server's requests are refused. A new activation is needed.

### Epic 2: Accounts and sign-in

**US-2.1 Invite a teacher** (Must)
As a School Admin, I want to add a teacher and send an invite, so that they can use the portal.
- Required: full name, email. Optional: phone, staff number.
- The account is created as `invited` with no password.
- An email with a single-use link is sent and the invite is tracked.

**US-2.2 Bulk-invite teachers** (Should)
As a School Admin, I want to upload a CSV of teachers, so that I do not add them one by one.
- A preview shows valid rows, duplicates by email and errors.
- Nothing is created until the admin confirms.

**US-2.3 Activate a teacher account** (Must)
As a teacher, I want to open my invite link and set a password, so that I can sign in.
- The link works once and expires per BR-03.
- Password rules apply. On success I am signed in.
- An expired or used link shows a clear message and no data.

**US-2.4 Invite a parent** (Must)
As a School Admin, I want to send a parent an invite, so that they can see their children's results.
- The guardian must have a phone or email (BR-02).
- Channels offered: SMS, WhatsApp, email, printed slip. Cost-bearing channels show the monthly cap used.

**US-2.5 Activate a parent account** (Must)
As a parent, I want to verify my phone or email with a code and set a password, so that I can sign in safely.
- The code goes to the registered contact (BR-03).
- Five wrong codes lock the code. A new code can be requested after one minute.
- After activation I see every linked child.

**US-2.6 Share an invite manually** (Must)
As a School Admin, I want to copy an invite link or print an invite slip, so that I can reach people whose email or SMS fails.
- Copying a link is logged.
- A manually shared link still needs a code to the registered contact.

**US-2.7 Track and resend invites** (Must)
As a School Admin, I want an Invitations list, so that I can chase people who have not activated.
- Filter by state, role, class.
- Actions: resend, revoke, copy link, print slip. A bulk "resend to all pending" exists.

**US-2.8 Sign in** (Must)
As a staff member or parent, I want to sign in with my email or phone and password, so that I can reach my portal.
- Wrong credentials give a generic message.
- Repeated failures slow down and then lock the account for 15 minutes.
- Sessions expire after 12 hours for staff and 30 days for parents on a trusted device.

**US-2.9 Reset a forgotten password** (Must)
As a user, I want to reset my password through my registered contact, so that I can get back in.
- The response is the same whether or not the account exists.
- All other sessions are revoked after a reset.

**US-2.10 Two-step verification** (Should)
As a School Admin or Platform Owner, I want an authenticator app on my account, so that a stolen password is not enough.
- Setup shows a QR code and recovery codes. Required for the Platform Owner and first admin.

**US-2.11 Suspend or deactivate an account** (Must)
As a School Admin, I want to suspend or deactivate an account, so that people who leave lose access.
- Takes effect immediately and ends all sessions.
- Records are kept.

**US-2.12 Change a parent's contact** (Must)
As a School Admin, I want to correct a parent's phone or email, so that a lost number does not lock them out.
- The change is audit logged. Pending invites to the old contact are revoked.

### Epic 3: Academic structure

**US-3.1 Academic years and terms** (Must)
As a School Admin, I want to define years and terms, so that exams belong to a term.
- Exactly one current year and one current term.

**US-3.2 Levels and classes** (Must)
As a School Admin, I want to define levels (Primary 1 to 6, JSS 1 to 3, SS 1 to 3) and classes with arms, so that students are grouped correctly.
- Each level is marked primary or secondary. That decides which exam screen students see.
- A class belongs to a year and a level.

**US-3.3 Subjects** (Must)
As a School Admin, I want a subject list, so that exams and questions are organised.
- A subject can apply to primary, secondary or both.

**US-3.4 Assign teachers** (Must)
As a School Admin, I want to assign a teacher to a subject in a class, so that they can set and see its exams.
- One teacher per subject per class. A teacher can have many assignments.
- Teachers see only what is assigned (BR-19).

**US-3.5 Class teacher** (Should)
As a School Admin, I want to mark a teacher as class teacher, so that they can see and optionally release their class's results.

**US-3.6 Promote students** (Should)
As a School Admin, I want to move a class to the next level at year end, so that I do not edit students one by one.
- A preview shows who moves where. Graduates are marked graduated. History is kept.

**US-3.7 Grade scale** (Should)
As a School Admin, I want to edit the grade scale, so that results match school policy.
- Bands must cover 0 to 100 with no gaps or overlaps.

### Epic 4: Students and guardians

**US-4.1 Register a student** (Must)
As a School Admin, I want to add a student, so that they can sit exams.
- Required: first name, last name, class. Optional: admission number, gender, date of birth.
- A student code is generated (BR-08).

**US-4.2 Import students** (Must)
As a School Admin, I want to upload a CSV class list, so that I can register hundreds at once.
- A preview flags duplicates by admission number, unknown classes and missing fields.
- Nothing is created until the admin confirms. A report of created and skipped rows is downloadable.

**US-4.3 Print student codes** (Must)
As a School Admin, I want a printable sheet of codes per class, so that I can give each student theirs.
- A PDF with name, class and code per student, cut into slips.
- The sheet is logged. It is only generated on request.

**US-4.4 Reissue a code** (Must)
As a School Admin, I want to reissue a lost code, so that the student can still sit exams.
- The old code stops working immediately. The history is kept.

**US-4.5 Register a guardian and link children** (Must)
As a School Admin, I want to add a parent and link them to one or more children, so that the parent can see them.
- Required: full name, phone or email, relationship.
- Matching follows BR-04. The admin confirms a suggested match.

**US-4.6 Import guardians** (Must)
As a School Admin, I want to upload a CSV of guardians with child admission numbers, so that I can link them in bulk.
- Rows with the same phone become one guardian with several children.
- Unknown admission numbers are flagged.

**US-4.7 Restrict a guardian** (Should)
As a School Admin, I want to hide results from a specific guardian for a child, so that disputes are respected.
- The change is audit logged. The guardian still sees other children.

**US-4.8 Transfer, withdraw or graduate** (Should)
As a School Admin, I want to change a student's status, so that rosters stay correct.
- Withdrawn students cannot sit exams. History stays. Guardian links stay read-only.

**US-4.9 Record parental consent** (Must)
As a School Admin, I want to record that consent for a child's data was given, so that the school meets its duties.
- Records version of notice, date and source. Bulk "mark consent collected" for a class is allowed.

### Epic 5: Question bank

**US-5.1 Create a question** (Must)
As a teacher, I want to add a question, so that I can use it in exams.
- Types: single choice, multiple choice, true or false, fill in the blank.
- Required: subject, stem, correct answer. Options for choice questions: 2 to 6.
- Default marks 1. Difficulty and topic optional.

**US-5.2 Images and maths** (Must)
As a teacher, I want to add pictures and formulas, so that I can ask science and maths questions.
- Images on the stem and on options, up to a size limit, converted to web size.
- Maths typed as `$...$` shows as a formula in preview.

**US-5.3 Organise and search** (Should)
As a teacher, I want to filter by subject, level, topic, difficulty and status, so that I can find questions.

**US-5.4 Approve questions** (Should)
As a School Admin, I want an optional review step, so that a head of department can check questions.
- When off, a teacher's saved questions are approved. When on, they wait for approval.

**US-5.5 Edit an approved question** (Must)
As a teacher, I want to change a question that is already approved, so that I can fix mistakes.
- A new version is created and the old one is archived (BR-12).
- Exams already frozen keep the old version.

**US-5.6 Share within a subject** (Should)
As a teacher, I want to use approved questions written by other teachers of the same subject, so that we do not duplicate work.

**US-5.7 Preview as a student** (Should)
As a teacher, I want to see a question as a student would, in the primary or secondary style, so that I know how it looks.

### Epic 6: Import from Word and Excel

**US-6.1 Download templates** (Must)
As a teacher, I want Excel and Word templates, so that I know how to prepare my file.
- Templates include examples and short instructions.

**US-6.2 Upload Excel or CSV** (Must)
As a teacher, I want to upload a spreadsheet of questions, so that I can prepare them at home.
- Accepts `.xlsx` and `.csv`, up to the size and row limits.
- Parsing runs in the background and shows progress.

**US-6.3 Upload Word** (Must)
As a teacher, I want to upload a Word file of questions, so that I do not retype them.
- Accepts `.docx`. Rejects `.docm` and files with macros.
- Pictures in the file are attached to their questions.

**US-6.4 Preview and fix** (Must)
As a teacher, I want to see every detected question before importing, so that I can correct problems.
- Rows are marked valid, warning or error with the reason: missing answer, answer matches no option, duplicate options, likely duplicate of an existing question, unsupported type.
- I can edit a row, skip it or accept it.

**US-6.5 Confirm import** (Must)
As a teacher, I want to confirm the import, so that the questions enter my bank.
- Questions are created as drafts, never placed directly in an exam.
- A summary shows created, skipped and fixed counts.

**US-6.6 Import history** (Could)
As a teacher, I want to see my past imports, so that I can trace where questions came from.

### Epic 7: Exams and scheduling

**US-7.1 Build an exam** (Must)
As a teacher, I want to pick questions from the bank for a subject and class, so that I can create an exam.
- Choose classes (one or several arms), term, and questions. Reorder them. Marks per question can be changed.
- The total marks are shown.

**US-7.2 Exam settings** (Must)
As a teacher, I want to set duration, instructions, shuffling and score visibility, so that the exam fits the school's rules.
- Duration in minutes. Shuffle questions and options on or off. Show score to the student at submission on or off (default off).

**US-7.3 Preview the full exam** (Should)
As a teacher, I want to step through the exam as a student, so that I can catch mistakes.

**US-7.4 Schedule a sitting** (Must)
As a School Admin or teacher, I want to set a date, start time and hard close time, so that the lab is booked.
- A warning appears if two sittings overlap in the same lab.

**US-7.5 Freeze** (Must)
As the system, I freeze an exam 24 hours before its sitting (BR-11).
- Editing a frozen exam warns that it creates a new pack version.

**US-7.6 Publish the pack** (Must)
As a School Admin or teacher, I want the exam turned into a pack for the school server, so that it can run offline.
- Publishing is blocked if the exam has no questions or any question has no answer key.
- The status shows when the school server has downloaded and verified it.

**US-7.7 Change after freeze** (Must)
As a teacher, I want to fix an exam after the freeze, so that mistakes do not reach students.
- A new pack version is created. The old version is marked superseded. The school server must load the new one before the sitting opens.

**US-7.8 Cancel or reschedule** (Must)
As a School Admin, I want to cancel or move a sitting, so that plans can change.
- The school server is told at its next sync. The console shows cancelled or the new time.

**US-7.9 Duplicate an exam** (Could)
As a teacher, I want to copy an exam, so that I can reuse it for another class.

### Epic 8: School server setup

**US-8.1 Install the exam server** (Must)
As the person setting up the lab, I want to run one installer, so that the PC becomes the exam server.
- Installs a Windows service that starts on boot and restarts on failure.
- Creates the firewall rule, turns off sleep, creates backup task and data folders.

**US-8.2 Activate** (Must)
As the installer, I want to enter the activation code, so that the server connects to this school.
- Success shows the school name. A wrong or used code shows a clear message.

**US-8.3 Set the console PIN** (Must)
As the installer, I want to set a six-digit PIN, so that only authorised people use the console.

**US-8.4 Pull roster and packs** (Must)
As the exam server, I want to download classes, students and scheduled packs, so that I am ready.
- Downloads resume if interrupted. Each pack is verified (signature and hash).

**US-8.5 Readiness check** (Must)
As an invigilator, I want a clear ready or not ready status for each sitting, so that I know before exam day.
- Checks: pack present and verified at the latest version, roster current, free disk, clock sane, backup recent.
- Anything missing is shown in plain words with what to do.

**US-8.6 Import a pack from USB** (Should)
As an invigilator, I want to load a pack from a file, so that I can run an exam when the internet is down.

### Epic 9: Sitting management (Invigilator console)

**US-9.1 Sign in** (Must)
As an invigilator, I want to enter the PIN, so that I can use the console.

**US-9.2 Open a sitting** (Must)
As an invigilator, I want to open a ready sitting and see the exam key, so that students can start.
- A fresh six-digit key is generated and shown large enough to read from the back of the room.
- Opening is blocked if the pack is not ready, unless I confirm an override that is logged.

**US-9.3 Watch live progress** (Must)
As an invigilator, I want a live list of seats with status, so that I can see who needs help.
- Status per seat: not started, in progress with last saved time, submitted, offline for more than 30 seconds.
- Updates appear within 3 seconds.

**US-9.4 Assign seats** (Should)
As an invigilator, I want to map students to PCs, so that I can control who sits where.
- Seat labels come from the shortcut or from the console. A student at the wrong seat is flagged, not blocked, unless the school turns on strict seats.

**US-9.5 Extra time** (Must)
As an invigilator, I want to give a student or the whole room extra minutes, with a reason, so that late starts and interruptions are fair.
- The new end time shows on the student's screen within one save cycle.

**US-9.6 Reset a session** (Must)
As an invigilator, I want to reset a stuck session, with a reason, keeping or discarding answers, so that a student can carry on.
- The old session is marked reset and kept for audit.

**US-9.7 Close a sitting** (Must)
As an invigilator, I want to close the sitting, so that all open sessions are submitted and marked.
- A confirmation shows how many are still in progress.

**US-9.8 Move a student to another PC** (Should)
As an invigilator, I want to let a student continue on a different PC, so that a dead machine does not end their exam.
- Resume works from any seat once the old seat has been offline for 30 seconds, or after the invigilator approves.

**US-9.9 See server health** (Must)
As an invigilator, I want to see disk space, clock, last backup and sync state, so that problems are visible.

### Epic 10: Student exam

**US-10.1 Enter code and key** (Must)
As a student, I want to type my code and the exam key, so that I can start.
- A mistyped code is caught by the check character before any lookup.
- Errors are specific and kind: code not found, key wrong, exam not open, already submitted.
- Five failures lock that seat for one minute.

**US-10.2 Instructions and start** (Must)
As a student, I want to see my name, the subject, duration and instructions before I begin, so that I know it is me and what to do.
- The timer starts when I press Start, not when I log in.

**US-10.3 Answer questions, secondary** (Must)
As a secondary student, I want a clear screen with the question, options and a navigator, so that I can move around.
- Navigator shows answered, unanswered and flagged.
- Keyboard shortcuts for options and next or previous.

**US-10.4 Answer questions, primary** (Must)
As a primary student, I want one large question at a time with big buttons and pictures, so that it is easy.
- Larger text, fewer visual elements, optional read-aloud for text questions.

**US-10.5 Flag and review** (Must)
As a student, I want to flag questions and see a review screen before submitting, so that I do not leave any unanswered by accident.

**US-10.6 Autosave status** (Must)
As a student, I want to see that my answers are saved, so that I am not worried.
- Shows "Saved" with a time. If the server cannot be reached, shows "Your answers are kept on this PC" and keeps working.

**US-10.7 Resume** (Must)
As a student whose PC froze or lost power, I want to sign in again and continue, so that I do not lose work.
- Saved answers and remaining time are restored. Question order is the same as before.

**US-10.8 Timer and warnings** (Must)
As a student, I want a visible countdown with warnings, so that I can manage my time.
- Warnings at 10 minutes, 5 minutes and 1 minute. At zero my answers are submitted automatically.

**US-10.9 Submit** (Must)
As a student, I want to submit with a confirmation, so that I know I am done.
- Unanswered count is shown in the confirmation. After submission I cannot change answers.

**US-10.10 See score** (Could)
As a student, I want to see my score right after submitting if the teacher allows it.
- Off by default per exam.

**US-10.11 Accessibility basics** (Should)
As a student, I want adjustable text size and good contrast, so that I can read comfortably.

### Epic 11: Marking and results

**US-11.1 Auto-mark** (Must)
As the exam server, I want to mark objective questions on submission, so that results are instant.
- Follows BR-13. Marking is done by the shared marking code used in the cloud.

**US-11.2 Results arrive in the cloud** (Must)
As a teacher, I want results to appear in my portal after the school server syncs, so that I can review them.
- Shows draft results per class with a "last synced" time.

**US-11.3 Review results** (Must)
As a teacher, I want to see scores, each student's answers and question statistics, so that I can check them before release.
- Per class: scores, average, highest, lowest, pass rate. Per question: percent correct.
- I can mark a result reviewed.

**US-11.4 Correct a key and re-mark** (Must)
As a teacher, I want to fix a wrong answer key and re-mark, so that students are scored fairly.
- Re-marking runs in the cloud on stored answers. It shows how many scores changed before I confirm.
- A new revision is created for each changed result (BR-15).

**US-11.5 Make-up sitting** (Should)
As a School Admin, I want a list of absent students and a way to schedule a make-up sitting, so that nobody is missed.

**US-11.6 Class results sheet** (Must)
As a teacher or School Admin, I want a class results sheet I can export, so that I can use it in school records.
- Export to Excel and PDF.

**US-11.7 Student result history** (Should)
As a School Admin or teacher, I want a student's results across subjects and terms, so that I can see their progress.

### Epic 12: Release and the Parent Portal

**US-12.1 Release results** (Must)
As a School Admin (or Class Teacher if allowed), I want to release reviewed results for an exam and class, so that parents can see them.
- Only reviewed results can be released. A confirmation shows the number of students.
- Release triggers notifications.

**US-12.2 Parent sees children** (Must)
As a parent, I want my linked children on one screen, so that I can pick one.
- A child switcher is always visible.

**US-12.3 Parent views a result** (Must)
As a parent, I want to open an exam result with score, percent, grade, class average and date, so that I understand how my child did.
- Shows only released results (BR-14). Shows an "updated" label after a re-mark.

**US-12.4 Trends** (Should)
As a parent, I want to see my child's results by subject and over terms, so that I see progress.

**US-12.5 Notifications** (Must)
As a parent, I want a message when new results are released, so that I do not have to keep checking.
- Channel per BR-21. The message links to the portal and never contains scores.

**US-12.6 Update my details** (Should)
As a parent, I want to add an email, change my password and set how I receive notifications, so that I control my account.
- Adding an email requires a one-time code to that email.

**US-12.7 Withdraw or correct a released result** (Should)
As a School Admin, I want to withdraw a released result, so that a mistake can be undone.
- The parent sees "under review". The change is logged.

### Epic 13: Notifications

**US-13.1 Channels** (Must)
As the platform, I send email by default, and SMS and WhatsApp when the school has enabled them.

**US-13.2 Delivery tracking** (Must)
As a School Admin, I want to see sent, failed and read status, so that I can follow up.

**US-13.3 SMS cap** (Should)
As a School Admin, I want a monthly cap on paid messages, so that costs stay controlled.
- At 80% of the cap I get a warning. At the cap, paid channels stop and email continues.

### Epic 14: Dashboards and reports

**US-14.1 Admin dashboard** (Must)
As a School Admin, I want one screen showing what is happening, so that I can see the school at a glance.
- Upcoming sittings and their readiness, results awaiting review, results awaiting release, invitations pending, server health and last sync.

**US-14.2 Teacher dashboard** (Should)
As a teacher, I want my upcoming exams, imports and results to review in one place.

**US-14.3 Exports** (Should)
As a School Admin, I want to export students, results and invitations to Excel or CSV, so that I can use them elsewhere.

### Epic 15: Sync and resilience

**US-15.1 Automatic sync** (Must)
As the exam server, I want to sync with the cloud whenever internet is available, so that nobody has to remember.
- Pulls changes and packs. Pushes results. Retries with backoff. Never blocks an exam.

**US-15.2 Visible sync status** (Must)
As an invigilator or admin, I want to see "last synced" and anything waiting, so that I know if parents will see current data.

**US-15.3 USB export and import** (Should)
As an invigilator, I want to export unsent results to a file and import it in the cloud, so that a school with no internet can still deliver results.

**US-15.4 Backups** (Must)
As the exam server, I want to back up after each sitting and nightly, so that a disk failure does not lose results.
- Backups go to a second location. The latest backup is uploaded to the cloud when online. The last 30 are kept.

**US-15.5 Restore** (Must)
As the person replacing a dead PC, I want to restore from a backup or from the cloud, so that the school is back in under an hour.

**US-15.6 Updates** (Must)
As the Platform Owner, I want to roll out new versions safely, so that fixes reach schools.
- A backup is taken first. The update is blocked while a sitting is open. A failed update rolls back.

### Epic 16: Audit and privacy

**US-16.1 Audit log** (Must)
As a School Admin, I want a log of important actions, so that I can see who did what.
- Covers sign-ins, invites, role changes, code reissues, releases, re-marks, console actions.
- Entries cannot be edited or deleted.

**US-16.2 Data requests** (Should)
As a School Admin, I want to export or delete a student's data on request, so that the school can answer data subject requests.

**US-16.3 Retention** (Should)
As a School Admin, I want old data removed per the school's retention rule, so that we hold it no longer than needed (BR-22).

### Epic 17: School fees (Phase 2)

**US-17.1 Fee structure** (Phase 2)
As a School Admin or Bursar, I want to define fee items per class and term, so that invoices are generated.

**US-17.2 Pay online** (Phase 2)
As a parent, I want to pay full or part of a child's fees with a link or in the portal, so that I do not visit the bursar.
- Payments go through a payment provider. Receipts are emailed to the parent and the school.

**US-17.3 Outstanding balances** (Phase 2)
As a School Admin or Bursar, I want to see outstanding balances per class and send reminders, so that collection improves.

**US-17.4 Receipts** (Phase 2)
As a parent, I want a receipt for every payment, so that I have proof.

---

## 8. Screens by role

A starting list for the designer. Each line is a screen or a major panel.

**Platform Owner:** Schools list, School detail and licence, Server health list, Server detail, Activation codes.

**School Admin:** Dashboard, Academic years and terms, Levels and classes, Subjects, Teacher list and invite, Teacher assignments, Students list and detail, Student import, Code sheets, Guardians list and detail, Guardian import, Invitations, Exams overview, Sittings calendar, Pack status, Results awaiting review, Release results, Make-up sittings, Notifications log, Sync and server status, Audit log, Settings (grade scale, consent, SMS cap, retention).

**Teacher:** Dashboard, Question bank list, Question editor, Import wizard (upload, preview, confirm), Exam builder, Exam preview, Schedule sitting, Results by exam, Result detail, Question statistics, Re-mark.

**Invigilator console (school lab):** PIN sign-in, Overview and readiness, Sitting detail (key, seats, progress), Session actions (extra time, reset), Sync and backup, Server health, Import pack from file.

**Student exam client:** Code and key entry, Instructions and start, Question screen (secondary), Question screen (primary), Review and submit, Submitted confirmation, Error and reconnect messages.

**Parent portal:** Invite claim (open link, request code, set password), Sign in, Reset password, Children and switcher, Result list for a child, Result detail, Trends, Account and notifications.

**Phase 2:** Fee setup, Invoices, Payments, Receipts, Outstanding balances.

---

## 9. Reports and exports

| Report | Who | Format |
|---|---|---|
| Class results sheet | Teacher, Admin | Excel, PDF |
| Student result history | Teacher, Admin | PDF |
| Question statistics (percent correct per question) | Teacher | On screen, Excel |
| Student code sheet | Admin | PDF (print) |
| Invitations and activation status | Admin | Excel |
| Sitting attendance (who sat, who was absent) | Admin, Teacher | Excel |
| Notification delivery log | Admin | Excel |
| Audit log | Admin | Excel |
| Server health summary | Platform Owner | On screen |

---

## 10. Assumptions, dependencies and open questions

### 10.1 Assumptions

- The school can supply class lists and parent phone numbers in a spreadsheet.
- Most parents have a smartphone and a mobile number. Some have no email.
- Teachers have an email address, or can create one.
- One dedicated lab PC can run the exam server (to be confirmed by the site survey).
- The lab runs a recent Chrome or Edge.
- Exams in the first release are objective only.

### 10.2 Dependencies

| Dependency | Needed for |
|---|---|
| Email provider account | Invites, resets, notifications |
| SMS or WhatsApp provider | Parent invites and notifications, if used |
| Cloud hosting and domain | Everything in the cloud |
| Code-signing certificate | The Windows installer |
| UI designer | Screens in section 8 |
| School site survey | Installer scope, hardware, quote |

### 10.3 Open questions

1. How many students and parents does the school have?
2. Do most parents have a phone number the school already holds?
3. Which channel do parents prefer for invites: SMS, WhatsApp or email?
4. Should the school need approval before teachers' questions enter the bank?
5. Who may release results: only the admin, or Class Teachers too?
6. Should students see their score immediately after an exam?
7. What grade scale does the school use today?
8. How long should results be kept?
9. Is school-fee payment in the first release?
10. What did the 12-second voice note say?

---

## 11. MVP acceptance checklist

The MVP is ready for a pilot when all of this is true on a real lab PC with a real class:

- [ ] A School Admin creates teachers, students and guardians by import, and invites go out.
- [ ] A teacher activates an account from the invite and builds an exam from an imported Word or Excel file.
- [ ] The exam is published, the school server downloads and verifies the pack, and the readiness check passes.
- [ ] 30 students sign in with codes and the exam key, and complete the exam.
- [ ] The exam server is restarted mid-exam, and every session resumes with its saved answers and remaining time.
- [ ] One student's PC is switched off mid-exam, and the student continues on another PC.
- [ ] The internet is off for the whole sitting, and the exam is unaffected.
- [ ] The server syncs when internet returns, and results appear in the cloud with no duplicates after a deliberately repeated upload.
- [ ] A wrong answer key is corrected, and re-marking updates the affected scores.
- [ ] Results are reviewed and released, and a parent with two children signs in once, sees both, and sees only released results.
- [ ] A parent cannot see another family's child by any route.
- [ ] A teacher cannot see another teacher's classes.
- [ ] A dead server is replaced on a spare PC from backup or the cloud in under an hour.
- [ ] The audit log shows each of the actions above.
