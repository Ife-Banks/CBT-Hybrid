# CBT Platform — Database Architecture & Optimization

**Version:** 1.1  
**Date:** October 14, 2026  
**Status:** Production-ready specification  
**Companion Documents:** CBT-02-Data-Model.md, CBT-Technical-Design.md, CBT-03-API-and-Sync-Specification.md

---

## Table of Contents

1. [Overview & Architecture Philosophy](#1-overview--architecture-philosophy)
2. [Database Strategy: Why Two Databases](#2-database-strategy-why-two-databases)
3. [Cloud Database (PostgreSQL): Complete Schema](#3-cloud-database-postgresql-complete-schema)
4. [School Database (SQLite): Complete Schema](#4-school-database-sqlite-complete-schema)
5. [Indexing Strategy](#5-indexing-strategy)
6. [Query Optimization Patterns](#6-query-optimization-patterns)
7. [Full-Text Search Implementation](#7-full-text-search-implementation)
8. [Partitioning Strategy](#8-partitioning-strategy)
9. [Row-Level Security (RLS)](#9-row-level-security-rls)
10. [Connection Pooling & Performance](#10-connection-pooling--performance)
11. [Backup & Recovery Strategy](#11-backup--recovery-strategy)
12. [Migration Strategy](#12-migration-strategy)
13. [Monitoring & Maintenance](#13-monitoring--maintenance)
14. [Data Retention & Archival](#14-data-retention--archival)
15. [Performance Benchmarks & SLAs](#15-performance-benchmarks--slas)

---

## 1. Overview & Architecture Philosophy

### 1.1 Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Single Writer Per Record** | Cloud owns setup/questions, School owns sessions/answers — no conflicts |
| **Eventual Consistency** | School syncs when online; exams never wait for cloud |
| **Zero Data Loss** | SQLite `PRAGMA synchronous=FULL`; PostgreSQL with WAL archiving |
| **Multi-Tenancy** | Every table has `school_id` with RLS enforcement |
| **Audit Immutability** | Separate write-only role for audit logs |
| **Performance First** | Strategic indexes, materialized views, connection pooling |

### 1.2 Technology Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Cloud DBMS | PostgreSQL | 15+ | Multi-tenant, ACID, advanced indexing |
| School DBMS | SQLite | 3.42+ | Embedded, zero-admin, crash-proof with WAL |
| ORM | Drizzle ORM | 0.28+ | Type-safe queries, supports both databases |
| Migration Tool | drizzle-kit | Latest | Version-controlled schema changes |
| Connection Pool | pg (node-postgres) | Latest | Cloud API connection management |
| FTS Engine | PostgreSQL tsvector | Built-in | Full-text search on questions, students |

### 1.3 Database Separation of Concerns

```
┌─────────────────────────────────────────────────────────────┐
│ CLOUD DATABASE (PostgreSQL)                                 │
│ ─────────────────────────────────────────────────────────── │
│ OWNS: Schools, Users, Students, Guardians, Questions,       │
│       Exams, Results Review, Parent Portal Data             │
│                                                              │
│ OPERATIONS: Setup, Content Creation, Review, Release        │
│ WRITES: Admin actions, Teacher authoring, Parent queries    │
│ SIZE: ~100GB for 50 schools over 3 years                    │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ HTTPS Sync (outbound only)
                            │
┌─────────────────────────────────────────────────────────────┐
│ SCHOOL DATABASE (SQLite)                                    │
│ ─────────────────────────────────────────────────────────── │
│ OWNS: Sessions, Answers, Raw Scores, Seat States            │
│                                                              │
│ OPERATIONS: Live Exam, Answer Saves, Marking, Sync Queue    │
│ WRITES: Student answers (200+ writes/sec during peak exam)  │
│ SIZE: ~500MB per school per year (answers compressed)       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Database Strategy: Why Two Databases

### 2.1 PostgreSQL (Cloud) — Why?

| Requirement | PostgreSQL Feature |
|-------------|-------------------|
| Multi-school tenancy | Row-Level Security (RLS) with `school_id` |
| Complex queries | JOINs, CTEs, window functions |
| Full-text search | Built-in `tsvector` and GIN indexes |
| Audit immutability | Role-based privilege separation |
| JSON storage | `jsonb` with indexing for flexible fields |
| Concurrent writes | MVCC handles many teachers editing simultaneously |
| Backup & HA | WAL archiving, streaming replication, point-in-time recovery |

### 2.2 SQLite (School) — Why?

| Requirement | SQLite Feature |
|-------------|----------------|
| Zero-config | Single file, no service to crash |
| Crash safety | WAL mode with `synchronous=FULL` survives power loss |
| Fast reads | Ideal for 1 writer (server), many readers (browsers) |
| Portability | Backup = file copy; restore = file replace |
| Low resource | Runs on a school lab PC with 4GB RAM |
| Offline-first | No network dependency during exams |

### 2.3 Data Ownership Matrix

| Data Type | Cloud (PostgreSQL) | School (SQLite) | Sync Direction |
|-----------|-------------------|-----------------|----------------|
| Schools, Users, Teachers | ✅ Owner | ❌ Never sent | — |
| Students, Codes | ✅ Owner | ✅ Read-only copy | Down |
| Guardians, Parents | ✅ Owner | ❌ Never sent (privacy) | — |
| Questions, Answer Keys | ✅ Owner | ✅ Encrypted in packs | Down (pack only) |
| Exams, Sittings | ✅ Owner | ✅ Read-only copy | Down |
| Sessions, Answers | ❌ Never created | ✅ Owner | Up (results only) |
| Scores (raw) | ❌ Never created | ✅ Owner | Up |
| Results (reviewed) | ✅ Owner | ❌ Not sent back | — |
| Audit Logs | ✅ Owner (cloud actions) | ✅ Owner (console actions) | Up (console logs) |

---

## 3. Cloud Database (PostgreSQL): Complete Schema

### 3.1 Schema Organization

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- Trigram similarity search
CREATE EXTENSION IF NOT EXISTS "btree_gin";  -- Multi-column GIN indexes

-- Schemas for logical separation (optional, single schema is also fine)
CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS audit;           -- Audit tables in separate schema
```

### 3.2 Core Tables with Optimization

#### 3.2.1 Schools & Tenancy

```sql
CREATE TABLE schools (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  code              TEXT NOT NULL UNIQUE 
                    CHECK (code ~ '^[A-Z0-9]{3,6}$'),
  name              TEXT NOT NULL,
  address           TEXT,
  logo_asset_id     TEXT,
  timezone          TEXT NOT NULL DEFAULT 'Africa/Lagos',
  grade_scale_id    TEXT,
  status            TEXT NOT NULL DEFAULT 'active' 
                    CHECK (status IN ('active','suspended','trial','expired')),
  licence_expires   DATE,
  max_students      INTEGER DEFAULT 1000,
  settings          JSONB DEFAULT '{}'::JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_schools_status ON schools(status) WHERE status = 'active';
CREATE INDEX idx_schools_expiry ON schools(licence_expires) WHERE licence_expires IS NOT NULL;
CREATE INDEX idx_schools_settings ON schools USING GIN(settings);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_schools_updated_at BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE schools IS 'Tenant root: one row per school customer';
COMMENT ON COLUMN schools.settings IS 'JSONB: {features_enabled, billing_plan, custom_branding}';
```

#### 3.2.2 Users & Authentication

```sql
CREATE TABLE users (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id         TEXT REFERENCES schools(id) ON DELETE RESTRICT,
  role              TEXT NOT NULL 
                    CHECK (role IN ('platform_owner','school_admin','teacher','parent','bursar')),
  full_name         TEXT NOT NULL,
  email             CITEXT,
  phone_e164        TEXT,
  password_hash     TEXT,
  status            TEXT NOT NULL DEFAULT 'invited' 
                    CHECK (status IN ('invited','active','suspended','deactivated')),
  totp_secret_enc   BYTEA,
  recovery_codes    TEXT[],
  failed_logins     INTEGER NOT NULL DEFAULT 0,
  locked_until      TIMESTAMPTZ,
  last_login_at     TIMESTAMPTZ,
  must_change_pwd   BOOLEAN DEFAULT FALSE,
  preferences       JSONB DEFAULT '{}'::JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL),
  CHECK (school_id IS NOT NULL OR role = 'platform_owner')
);

-- Indexes for authentication & queries
CREATE UNIQUE INDEX idx_users_school_email 
  ON users(school_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_users_school_phone 
  ON users(school_id, phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX idx_users_school_role 
  ON users(school_id, role) WHERE status = 'active';
CREATE INDEX idx_users_locked 
  ON users(locked_until) WHERE locked_until > NOW();

-- Full-text search on names (for admin user search)
ALTER TABLE users ADD COLUMN name_search TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('simple', full_name)) STORED;
CREATE INDEX idx_users_name_search ON users USING GIN(name_search);

-- Trigger
CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE users IS 'All human accounts except students';
COMMENT ON COLUMN users.totp_secret_enc IS 'Encrypted with app master key, NULL if 2FA disabled';
```

#### 3.2.3 Sessions (Authentication)

```sql
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,  -- SHA-256(random token)
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,     -- Second hash for token rotation
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  last_seen_at  TIMESTAMPTZ,
  ip_address    INET,
  user_agent    TEXT,
  device_name   TEXT,
  revoked_at    TIMESTAMPTZ
);

-- Optimized for cleanup & lookups
CREATE INDEX idx_sessions_user ON sessions(user_id, created_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expires ON sessions(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_token ON sessions(token_hash) WHERE revoked_at IS NULL;

-- Auto-cleanup expired sessions (run daily)
CREATE INDEX idx_sessions_cleanup ON sessions(expires_at) WHERE expires_at < NOW() - INTERVAL '7 days';

COMMENT ON TABLE sessions IS 'Server-side session storage for cookie-based auth';
```

#### 3.2.4 Teacher Profiles

```sql
CREATE TABLE teacher_profiles (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  staff_no      TEXT,
  title         TEXT CHECK (title IN ('Mr','Mrs','Ms','Dr','Prof',NULL)),
  department    TEXT,
  qualifications TEXT,
  joined_date   DATE,
  metadata      JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_teacher_profiles_staff_no ON teacher_profiles(staff_no) WHERE staff_no IS NOT NULL;

COMMENT ON TABLE teacher_profiles IS 'Extended profile for users with role=teacher';
```

#### 3.2.5 Invitations & Activation

```sql
CREATE TABLE invitations (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id     TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('staff','guardian','password_reset')),
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  guardian_id   TEXT, -- REFERENCES guardians(id), added later
  token_hash    TEXT NOT NULL UNIQUE,
  channel       TEXT NOT NULL 
                CHECK (channel IN ('email','sms','whatsapp','printed','manual_link')),
  sent_to       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' 
                CHECK (status IN ('pending','sent','used','expired','revoked','failed')),
  expires_at    TIMESTAMPTZ NOT NULL,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Query patterns: list by school, find active invites, cleanup expired
CREATE INDEX idx_invitations_school_status ON invitations(school_id, status, created_at DESC);
CREATE INDEX idx_invitations_token ON invitations(token_hash) WHERE status IN ('pending','sent');
CREATE INDEX idx_invitations_expires ON invitations(expires_at) WHERE status IN ('pending','sent');
CREATE INDEX idx_invitations_guardian ON invitations(guardian_id) WHERE guardian_id IS NOT NULL;

COMMENT ON TABLE invitations IS 'Single-use tokens for account activation and password reset';
```

#### 3.2.6 OTP Challenges

```sql
CREATE TABLE otp_challenges (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  invitation_id TEXT REFERENCES invitations(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  purpose       TEXT NOT NULL 
                CHECK (purpose IN ('activate','reset','verify_contact','login_2fa')),
  sent_to       TEXT NOT NULL,
  code_hash     TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 5,
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only recent, unused challenges matter
CREATE INDEX idx_otp_challenges_lookup 
  ON otp_challenges(id, code_hash) WHERE consumed_at IS NULL AND expires_at > NOW();
CREATE INDEX idx_otp_cleanup 
  ON otp_challenges(expires_at) WHERE expires_at < NOW() - INTERVAL '1 day';

COMMENT ON TABLE otp_challenges IS 'One-time codes for identity verification';
```

#### 3.2.7 Students

```sql
CREATE TABLE students (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id         TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  admission_no      TEXT NOT NULL,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  other_names       TEXT,
  gender            TEXT CHECK (gender IN ('M','F')),
  date_of_birth     DATE,
  photo_asset_id    TEXT,
  status            TEXT NOT NULL DEFAULT 'active' 
                    CHECK (status IN ('active','graduated','withdrawn','transferred')),
  metadata          JSONB DEFAULT '{}'::JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (school_id, admission_no)
);

-- Search & filter indexes
CREATE INDEX idx_students_school_status ON students(school_id, status);
CREATE INDEX idx_students_school_admission ON students(school_id, admission_no);

-- Full-text search on names
ALTER TABLE students ADD COLUMN name_search TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('simple', 
      coalesce(first_name,'') || ' ' || 
      coalesce(last_name,'') || ' ' || 
      coalesce(other_names,'') || ' ' ||
      coalesce(admission_no,'')
    )
  ) STORED;
CREATE INDEX idx_students_name_search ON students USING GIN(name_search);

-- Trigram index for fuzzy search (optional, for typo tolerance)
CREATE INDEX idx_students_name_trgm ON students USING GIN(
  (first_name || ' ' || last_name) gin_trgm_ops
);

CREATE TRIGGER set_students_updated_at BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE students IS 'Student master records (no login accounts)';
COMMENT ON COLUMN students.metadata IS 'JSONB: {medical_info, special_needs, emergency_contacts}';
```

#### 3.2.8 Student Codes

```sql
CREATE TABLE student_codes (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  code        TEXT NOT NULL UNIQUE CHECK (length(code) BETWEEN 12 AND 20),
  status      TEXT NOT NULL DEFAULT 'active' 
              CHECK (status IN ('active','revoked','expired')),
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ,
  reason      TEXT,
  issued_by   TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- One active code per student (business rule BR-05)
CREATE UNIQUE INDEX idx_student_codes_active 
  ON student_codes(student_id) WHERE status='active';

-- Lookup by code during exam login
CREATE UNIQUE INDEX idx_student_codes_code 
  ON student_codes(code) WHERE status='active';

CREATE INDEX idx_student_codes_student ON student_codes(student_id, issued_at DESC);

COMMENT ON TABLE student_codes IS 'Generated exam login codes, one active per student';
COMMENT ON COLUMN student_codes.code IS 'Format: SCHOOL-XXXXXXXXC (8 random + 1 check char)';
```

#### 3.2.9 Guardians & Guardianships

```sql
CREATE TABLE guardians (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id       TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id         TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  full_name       TEXT NOT NULL,
  email           CITEXT,
  phone_e164      TEXT,
  relationship    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL)
);

-- Guardian matching by phone (for duplicate detection, BR-04)
CREATE UNIQUE INDEX idx_guardians_school_phone 
  ON guardians(school_id, phone_e164) WHERE phone_e164 IS NOT NULL;

-- Search by name or contact
ALTER TABLE guardians ADD COLUMN search_text TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('simple', 
      coalesce(full_name,'') || ' ' || 
      coalesce(email,'') || ' ' ||
      coalesce(phone_e164,'')
    )
  ) STORED;
CREATE INDEX idx_guardians_search ON guardians USING GIN(search_text);

CREATE INDEX idx_guardians_user ON guardians(user_id) WHERE user_id IS NOT NULL;

CREATE TRIGGER set_guardians_updated_at BEFORE UPDATE ON guardians
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE guardians IS 'Parent/guardian records before account activation';

-- Link table
CREATE TABLE guardianships (
  guardian_id       TEXT NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  student_id        TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relationship      TEXT,
  can_view_results  BOOLEAN NOT NULL DEFAULT TRUE,
  can_pay_fees      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (guardian_id, student_id)
);

CREATE INDEX idx_guardianships_student ON guardianships(student_id);
CREATE INDEX idx_guardianships_guardian_active 
  ON guardianships(guardian_id) WHERE can_view_results = TRUE;

COMMENT ON TABLE guardianships IS 'Many-to-many: one parent can have multiple children';
```

#### 3.2.10 Academic Structure

```sql
CREATE TABLE academic_years (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id   TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  starts_on   DATE,
  ends_on     DATE,
  is_current  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_academic_years_school_name ON academic_years(school_id, name);
CREATE UNIQUE INDEX idx_academic_years_current ON academic_years(school_id) WHERE is_current = TRUE;
CREATE INDEX idx_academic_years_dates ON academic_years(school_id, starts_on, ends_on);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE terms (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  academic_year_id  TEXT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  starts_on         DATE,
  ends_on           DATE,
  is_current        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_terms_year ON terms(academic_year_id);
CREATE UNIQUE INDEX idx_terms_year_current ON terms(academic_year_id) WHERE is_current = TRUE;
CREATE INDEX idx_terms_dates ON terms(starts_on, ends_on);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE levels (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id   TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  section     TEXT CHECK (section IN ('nursery','primary','secondary')),
  sort_order  INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_levels_school_name ON levels(school_id, name);
CREATE INDEX idx_levels_school_section ON levels(school_id, section, sort_order);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE classes (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id         TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  level_id          TEXT NOT NULL REFERENCES levels(id) ON DELETE RESTRICT,
  academic_year_id  TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  name              TEXT NOT NULL,
  arm               TEXT,
  form_teacher_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  capacity          INTEGER DEFAULT 40,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_classes_school_year ON classes(school_id, academic_year_id);
CREATE INDEX idx_classes_level ON classes(level_id);
CREATE INDEX idx_classes_teacher ON classes(form_teacher_id) WHERE form_teacher_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE enrolments (
  student_id        TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id          TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  academic_year_id  TEXT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  enrolled_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (student_id, academic_year_id)
);

CREATE INDEX idx_enrolments_class ON enrolments(class_id);
CREATE INDEX idx_enrolments_year ON enrolments(academic_year_id);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE subjects (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id   TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  code        TEXT,
  section     TEXT CHECK (section IN ('primary','secondary','both')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (school_id, name)
);

CREATE INDEX idx_subjects_school_section ON subjects(school_id, section);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE class_subjects (
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id  TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id  TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  
  PRIMARY KEY (class_id, subject_id, teacher_id)
);

CREATE INDEX idx_class_subjects_teacher ON class_subjects(teacher_id);
CREATE INDEX idx_class_subjects_subject ON class_subjects(subject_id);

COMMENT ON TABLE class_subjects IS 'Teacher assignments: basis for permission scoping';

-- ─────────────────────────────────────────────────────────────

CREATE TABLE grade_scales (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id   TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  bands       JSONB NOT NULL,  -- [{"min":70,"max":100,"grade":"A","remark":"Excellent"}]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CHECK (jsonb_typeof(bands) = 'array')
);

CREATE INDEX idx_grade_scales_school ON grade_scales(school_id);
CREATE UNIQUE INDEX idx_grade_scales_default ON grade_scales(school_id) WHERE is_default = TRUE;
```

#### 3.2.11 Question Bank

```sql
CREATE TABLE assets (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id       TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  storage_key     TEXT NOT NULL,
  original_name   TEXT,
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  sha256          TEXT NOT NULL,
  width           INTEGER,
  height          INTEGER,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assets_school ON assets(school_id, created_at DESC);
CREATE INDEX idx_assets_sha256 ON assets(sha256);
CREATE INDEX idx_assets_creator ON assets(created_by) WHERE created_by IS NOT NULL;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE questions (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id       TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id      TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  level_id        TEXT REFERENCES levels(id) ON DELETE SET NULL,
  type            TEXT NOT NULL 
                  CHECK (type IN ('single_choice','multi_choice','true_false','fill_blank','essay')),
  stem            TEXT NOT NULL,
  explanation     TEXT,
  marks           NUMERIC(5,2) NOT NULL DEFAULT 1.0 CHECK (marks > 0 AND marks <= 20),
  difficulty      TEXT CHECK (difficulty IN ('easy','medium','hard')),
  topic           TEXT,
  tags            TEXT[],
  fill_answers    JSONB,
  status          TEXT NOT NULL DEFAULT 'draft' 
                  CHECK (status IN ('draft','approved','retired')),
  supersedes_id   TEXT REFERENCES questions(id) ON DELETE SET NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  usage_count     INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  import_row_id   TEXT,
  
  CHECK (
    (type IN ('single_choice','multi_choice','true_false') AND fill_answers IS NULL) OR
    (type = 'fill_blank' AND fill_answers IS NOT NULL)
  )
);

-- Critical indexes for question bank queries
CREATE INDEX idx_questions_school_subject ON questions(school_id, subject_id, status);
CREATE INDEX idx_questions_level ON questions(level_id) WHERE level_id IS NOT NULL;
CREATE INDEX idx_questions_topic ON questions(school_id, topic) WHERE topic IS NOT NULL;
CREATE INDEX idx_questions_difficulty ON questions(difficulty) WHERE difficulty IS NOT NULL;
CREATE INDEX idx_questions_creator ON questions(created_by, status);
CREATE INDEX idx_questions_supersedes ON questions(supersedes_id) WHERE supersedes_id IS NOT NULL;

-- Full-text search on question stem and explanation
ALTER TABLE questions ADD COLUMN content_search TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('english', 
      coalesce(stem,'') || ' ' || 
      coalesce(explanation,'') || ' ' ||
      coalesce(topic,'')
    )
  ) STORED;
CREATE INDEX idx_questions_content_search ON questions USING GIN(content_search);

-- Array search on tags
CREATE INDEX idx_questions_tags ON questions USING GIN(tags) WHERE tags IS NOT NULL;

CREATE TRIGGER set_questions_updated_at BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE questions IS 'Question bank with versioning (approved questions immutable)';
COMMENT ON COLUMN questions.stem IS 'HTML subset with LaTeX math in $...$';
COMMENT ON COLUMN questions.usage_count IS 'Number of exams using this question (incremented on exam publish)';

-- ─────────────────────────────────────────────────────────────

CREATE TABLE question_options (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  question_id   TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  body          TEXT NOT NULL,
  is_correct    BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INTEGER NOT NULL,
  asset_id      TEXT REFERENCES assets(id) ON DELETE SET NULL
);

CREATE INDEX idx_question_options_question ON question_options(question_id, sort_order);
CREATE INDEX idx_question_options_correct ON question_options(question_id) WHERE is_correct = TRUE;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE question_assets (
  question_id   TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  asset_id      TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  
  PRIMARY KEY (question_id, asset_id)
);

CREATE INDEX idx_question_assets_asset ON question_assets(asset_id);
```

#### 3.2.12 Import System

```sql
CREATE TABLE import_jobs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id       TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL 
                  CHECK (kind IN ('questions_docx','questions_xlsx','students','guardians','teachers')),
  file_asset_id   TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  uploaded_by     TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'queued' 
                  CHECK (status IN ('queued','parsing','parsed','confirmed','cancelled','failed')),
  total_rows      INTEGER,
  ok_rows         INTEGER,
  warning_rows    INTEGER,
  error_rows      INTEGER,
  imported_rows   INTEGER,
  failure_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_import_jobs_school ON import_jobs(school_id, created_at DESC);
CREATE INDEX idx_import_jobs_status ON import_jobs(status, created_at) WHERE status IN ('queued','parsing');

-- ─────────────────────────────────────────────────────────────

CREATE TABLE import_rows (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  job_id      TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_no      INTEGER NOT NULL,
  raw         JSONB NOT NULL,
  parsed      JSONB,
  errors      JSONB,
  status      TEXT NOT NULL DEFAULT 'pending' 
              CHECK (status IN ('pending','ok','warning','error','skipped','imported')),
  entity_id   TEXT,
  
  UNIQUE (job_id, row_no)
);

CREATE INDEX idx_import_rows_job_status ON import_rows(job_id, status);
CREATE INDEX idx_import_rows_entity ON import_rows(entity_id) WHERE entity_id IS NOT NULL;
```

#### 3.2.13 Exams & Packs

```sql
CREATE TABLE exams (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id             TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  subject_id            TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  term_id               TEXT REFERENCES terms(id) ON DELETE SET NULL,
  kind                  TEXT NOT NULL DEFAULT 'exam' 
                        CHECK (kind IN ('test','exam','practice','quiz')),
  duration_min          INTEGER NOT NULL CHECK (duration_min > 0 AND duration_min <= 300),
  shuffle_questions     BOOLEAN NOT NULL DEFAULT TRUE,
  shuffle_options       BOOLEAN NOT NULL DEFAULT TRUE,
  negative_marking      BOOLEAN NOT NULL DEFAULT FALSE,
  show_score_to_student BOOLEAN NOT NULL DEFAULT FALSE,
  pass_mark_pct         NUMERIC(5,2),
  instructions          TEXT,
  status                TEXT NOT NULL DEFAULT 'draft' 
                        CHECK (status IN ('draft','ready','published','archived')),
  frozen_at             TIMESTAMPTZ,
  created_by            TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exams_school_status ON exams(school_id, status, created_at DESC);
CREATE INDEX idx_exams_subject ON exams(subject_id);
CREATE INDEX idx_exams_term ON exams(term_id) WHERE term_id IS NOT NULL;
CREATE INDEX idx_exams_creator ON exams(created_by);
CREATE INDEX idx_exams_frozen ON exams(frozen_at) WHERE frozen_at IS NOT NULL;

CREATE TRIGGER set_exams_updated_at BEFORE UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────

CREATE TABLE exam_classes (
  exam_id     TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  
  PRIMARY KEY (exam_id, class_id)
);

CREATE INDEX idx_exam_classes_class ON exam_classes(class_id);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE exam_questions (
  exam_id         TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id     TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  position        INTEGER NOT NULL,
  marks_override  NUMERIC(5,2),
  
  PRIMARY KEY (exam_id, question_id)
);

CREATE INDEX idx_exam_questions_question ON exam_questions(question_id);
CREATE INDEX idx_exam_questions_position ON exam_questions(exam_id, position);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE sittings (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id       TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_id         TEXT NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
  class_id        TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  window_start    TIMESTAMPTZ NOT NULL,
  window_end      TIMESTAMPTZ NOT NULL,
  extra_time_min  INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'scheduled' 
                  CHECK (status IN ('scheduled','open','closed','cancelled')),
  exam_key_hash   TEXT,
  opened_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  closed_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  
  CHECK (window_end > window_start)
);

CREATE INDEX idx_sittings_school_status ON sittings(school_id, status, window_start DESC);
CREATE INDEX idx_sittings_exam ON sittings(exam_id);
CREATE INDEX idx_sittings_class ON sittings(class_id);
CREATE INDEX idx_sittings_window ON sittings(window_start, window_end);

COMMENT ON COLUMN sittings.exam_key_hash IS 'SHA-256 of key, actual key only on school server';

-- ─────────────────────────────────────────────────────────────

CREATE TABLE exam_packs (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  exam_id       TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  key_version   INTEGER NOT NULL DEFAULT 1,
  manifest      JSONB NOT NULL,
  storage_key   TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  sha256        TEXT NOT NULL,
  signature     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (exam_id, version)
);

CREATE INDEX idx_exam_packs_exam ON exam_packs(exam_id, version DESC);
CREATE INDEX idx_exam_packs_sha256 ON exam_packs(sha256);
```

#### 3.2.14 Results & Submissions

```sql
CREATE TABLE submissions (
  id              TEXT PRIMARY KEY,  -- session_id from school server
  school_id       TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sitting_id      TEXT NOT NULL REFERENCES sittings(id) ON DELETE CASCADE,
  student_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam_id         TEXT NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
  pack_version    INTEGER NOT NULL,
  seat            TEXT,
  started_at      TIMESTAMPTZ NOT NULL,
  submitted_at    TIMESTAMPTZ NOT NULL,
  submit_reason   TEXT CHECK (submit_reason IN ('student','time_up','invigilator','window_closed')),
  school_score    NUMERIC(7,2),
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (sitting_id, student_id)
);

CREATE INDEX idx_submissions_school ON submissions(school_id, synced_at DESC);
CREATE INDEX idx_submissions_sitting ON submissions(sitting_id);
CREATE INDEX idx_submissions_student ON submissions(student_id, submitted_at DESC);
CREATE INDEX idx_submissions_exam ON submissions(exam_id);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE submission_answers (
  submission_id   TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id     TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  answer          JSONB NOT NULL,
  seq             INTEGER NOT NULL,
  answered_at     TIMESTAMPTZ,
  cloud_marks     NUMERIC(5,2),
  
  PRIMARY KEY (submission_id, question_id)
);

CREATE INDEX idx_submission_answers_question ON submission_answers(question_id);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE results (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  submission_id   TEXT NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  student_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam_id         TEXT NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
  score           NUMERIC(7,2) NOT NULL,
  max_score       NUMERIC(7,2) NOT NULL,
  percent         NUMERIC(5,2) NOT NULL,
  grade           TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' 
                  CHECK (status IN ('draft','reviewed','released','withdrawn')),
  revision        INTEGER NOT NULL DEFAULT 1,
  reviewed_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  released_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  released_at     TIMESTAMPTZ,
  teacher_comment TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Parent portal main query
CREATE INDEX idx_results_student_status ON results(student_id, status, released_at DESC);
CREATE INDEX idx_results_exam ON results(exam_id, status);
CREATE INDEX idx_results_school_status 
  ON results((SELECT school_id FROM students WHERE id = student_id), status, released_at DESC);

CREATE TRIGGER set_results_updated_at BEFORE UPDATE ON results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────

CREATE TABLE remark_runs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  exam_id         TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  pack_version    INTEGER NOT NULL,
  key_version     INTEGER NOT NULL,
  reason          TEXT NOT NULL,
  requested_by    TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  affected_count  INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_remark_runs_exam ON remark_runs(exam_id, created_at DESC);
```

#### 3.2.15 Notifications

```sql
CREATE TABLE notifications (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id     TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  guardian_id   TEXT, -- REFERENCES guardians(id)
  channel       TEXT NOT NULL 
                CHECK (channel IN ('email','sms','whatsapp','in_app','push')),
  template      TEXT NOT NULL,
  payload       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued' 
                CHECK (status IN ('queued','sending','sent','failed','skipped')),
  provider_ref  TEXT,
  error_msg     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ
);

CREATE INDEX idx_notifications_school ON notifications(school_id, created_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_notifications_guardian ON notifications(guardian_id, created_at DESC) WHERE guardian_id IS NOT NULL;
CREATE INDEX idx_notifications_status ON notifications(status, created_at) WHERE status IN ('queued','sending');
CREATE INDEX idx_notifications_channel ON notifications(channel, status);
```

#### 3.2.16 Sync & Devices

```sql
CREATE TABLE sync_devices (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id       TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  key_id          TEXT NOT NULL UNIQUE,
  secret_enc      BYTEA NOT NULL,
  public_key      TEXT,
  status          TEXT NOT NULL DEFAULT 'active' 
                  CHECK (status IN ('active','revoked','suspended')),
  last_seen_at    TIMESTAMPTZ,
  last_version    TEXT,
  last_status     JSONB,
  activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_by    TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_sync_devices_school ON sync_devices(school_id, status);
CREATE INDEX idx_sync_devices_last_seen ON sync_devices(last_seen_at DESC) WHERE status = 'active';

-- ─────────────────────────────────────────────────────────────

CREATE TABLE activation_codes (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id   TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  device_id   TEXT REFERENCES sync_devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_activation_codes_expires ON activation_codes(expires_at) WHERE used_at IS NULL;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE change_log (
  cursor      BIGSERIAL PRIMARY KEY,
  school_id   TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  op          TEXT NOT NULL CHECK (op IN ('upsert','delete')),
  payload     JSONB,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- School servers pull from their last cursor
CREATE INDEX idx_change_log_school_cursor ON change_log(school_id, cursor);
CREATE INDEX idx_change_log_entity ON change_log(entity, entity_id);

-- Partition by month (see section 8)
-- ALTER TABLE change_log ... (partitioning script below)

COMMENT ON TABLE change_log IS 'Cursor-based feed for school server sync';

-- ─────────────────────────────────────────────────────────────

CREATE TABLE sync_events (
  device_id     TEXT NOT NULL REFERENCES sync_devices(id) ON DELETE CASCADE,
  event_id      TEXT NOT NULL,
  type          TEXT NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome       TEXT NOT NULL CHECK (outcome IN ('accepted','duplicate','rejected')),
  error_msg     TEXT,
  
  PRIMARY KEY (device_id, event_id)
);

CREATE INDEX idx_sync_events_device ON sync_events(device_id, received_at DESC);
CREATE INDEX idx_sync_events_type ON sync_events(type, received_at DESC);
```

#### 3.2.17 Audit & Platform

```sql
CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  school_id   TEXT,
  actor_id    TEXT,
  actor_role  TEXT,
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  before      JSONB,
  after       JSONB,
  ip_address  INET,
  user_agent  TEXT,
  request_id  TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit queries are by school, time, or entity
CREATE INDEX idx_audit_logs_school_time ON audit_logs(school_id, at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id, at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity, entity_id, at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, at DESC);

-- Partition by month (large tables, see section 8)

COMMENT ON TABLE audit_logs IS 'Immutable audit trail; app role has INSERT only';

-- ─────────────────────────────────────────────────────────────

CREATE TABLE consents (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  school_id     TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  guardian_id   TEXT REFERENCES guardians(id) ON DELETE CASCADE,
  student_id    TEXT REFERENCES students(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  granted_at    TIMESTAMPTZ NOT NULL,
  evidence      TEXT,
  recorded_by   TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_consents_school ON consents(school_id, kind);
CREATE INDEX idx_consents_guardian ON consents(guardian_id) WHERE guardian_id IS NOT NULL;
CREATE INDEX idx_consents_student ON consents(student_id) WHERE student_id IS NOT NULL;
```

### 3.3 Materialized Views (Performance)

```sql
-- Fast dashboard: exam statistics per sitting
CREATE MATERIALIZED VIEW sitting_stats AS
SELECT 
  s.id AS sitting_id,
  s.school_id,
  s.exam_id,
  s.class_id,
  s.status,
  COUNT(DISTINCT sub.id) AS total_submissions,
  COUNT(DISTINCT sub.id) FILTER (WHERE sub.submitted_at IS NOT NULL) AS completed,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'released') AS released,
  AVG(r.percent) FILTER (WHERE r.status = 'released') AS avg_percent,
  MAX(sub.submitted_at) AS last_submission,
  NOW() AS refreshed_at
FROM sittings s
LEFT JOIN submissions sub ON sub.sitting_id = s.id
LEFT JOIN results r ON r.submission_id = sub.id
GROUP BY s.id, s.school_id, s.exam_id, s.class_id, s.status;

CREATE UNIQUE INDEX idx_sitting_stats_id ON sitting_stats(sitting_id);
CREATE INDEX idx_sitting_stats_school ON sitting_stats(school_id, status);

-- Refresh strategy: after sitting closes or results released
-- REFRESH MATERIALIZED VIEW CONCURRENTLY sitting_stats;

-- ─────────────────────────────────────────────────────────────

-- Fast parent portal: child summary
CREATE MATERIALIZED VIEW student_result_summary AS
SELECT
  st.id AS student_id,
  st.school_id,
  COUNT(r.id) AS total_results,
  COUNT(r.id) FILTER (WHERE r.status = 'released') AS released_results,
  AVG(r.percent) FILTER (WHERE r.status = 'released') AS avg_percent,
  MAX(r.released_at) AS last_result_date
FROM students st
LEFT JOIN results r ON r.student_id = st.id
WHERE st.status = 'active'
GROUP BY st.id, st.school_id;

CREATE UNIQUE INDEX idx_student_result_summary_id ON student_result_summary(student_id);
CREATE INDEX idx_student_result_summary_school ON student_result_summary(school_id);
```

---

## 4. School Database (SQLite): Complete Schema

### 4.1 SQLite Pragmas (Critical)

```sql
-- Set on every connection
PRAGMA journal_mode = WAL;           -- Write-Ahead Logging for concurrency
PRAGMA synchronous = FULL;           -- Every committed write survives power loss
PRAGMA foreign_keys = ON;            -- Enforce referential integrity
PRAGMA busy_timeout = 5000;          -- Wait 5s if database locked
PRAGMA cache_size = -64000;          -- 64MB cache (negative = KB)
PRAGMA temp_store = MEMORY;          -- Temp tables in memory
PRAGMA mmap_size = 268435456;        -- 256MB memory-mapped I/O
PRAGMA page_size = 4096;             -- Match OS page size
PRAGMA auto_vacuum = INCREMENTAL;    -- Reclaim space without full rebuild
```

### 4.2 School Server Schema

```sql
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Initial values set on activation
-- school_id, device_id, device_key_id, last_cursor, schema_version, cloud_public_key, console_pin_hash

INSERT INTO meta(key, value) VALUES 
  ('schema_version', '1'),
  ('created_at', datetime('now'));

-- ─────────────────────────────────────────────────────────────

CREATE TABLE classes (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  level_name TEXT,
  section   TEXT NOT NULL CHECK (section IN ('nursery','primary','secondary'))
);

CREATE INDEX idx_classes_section ON classes(section);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE subjects (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  code  TEXT
);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE students (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  code_status     TEXT NOT NULL CHECK (code_status IN ('active','revoked')),
  full_name       TEXT NOT NULL,
  class_id        TEXT REFERENCES classes(id),
  section         TEXT NOT NULL,
  photo_path      TEXT,
  synced_at       TEXT NOT NULL
);

CREATE INDEX idx_students_code ON students(code) WHERE code_status = 'active';
CREATE INDEX idx_students_class ON students(class_id);
CREATE INDEX idx_students_name ON students(full_name COLLATE NOCASE);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE exams (
  id                    TEXT PRIMARY KEY,
  title                 TEXT NOT NULL,
  subject_id            TEXT REFERENCES subjects(id),
  duration_min          INTEGER NOT NULL,
  settings_json         TEXT NOT NULL,  -- {shuffle, marks, pass_mark, etc}
  synced_at             TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE packs (
  id              TEXT PRIMARY KEY,
  exam_id         TEXT NOT NULL REFERENCES exams(id),
  version         INTEGER NOT NULL,
  key_version     INTEGER NOT NULL,
  dir_path        TEXT NOT NULL,
  sha256          TEXT NOT NULL,
  verified        INTEGER NOT NULL DEFAULT 0,
  question_count  INTEGER,
  total_marks     REAL,
  downloaded_at   TEXT NOT NULL,
  
  UNIQUE (exam_id, version)
);

CREATE INDEX idx_packs_exam ON packs(exam_id, version DESC);
CREATE INDEX idx_packs_verified ON packs(verified) WHERE verified = 0;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE sittings (
  id              TEXT PRIMARY KEY,
  exam_id         TEXT NOT NULL REFERENCES exams(id),
  class_id        TEXT NOT NULL REFERENCES classes(id),
  pack_id         TEXT NOT NULL REFERENCES packs(id),
  window_start    TEXT NOT NULL,
  window_end      TEXT NOT NULL,
  extra_time_min  INTEGER NOT NULL DEFAULT 0,
  exam_key_hash   TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled' 
                  CHECK (status IN ('scheduled','open','closed')),
  opened_at       TEXT,
  closed_at       TEXT,
  synced_at       TEXT NOT NULL
);

CREATE INDEX idx_sittings_status ON sittings(status, window_start);
CREATE INDEX idx_sittings_exam ON sittings(exam_id);
CREATE INDEX idx_sittings_class ON sittings(class_id);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE seats (
  code          TEXT PRIMARY KEY,
  label         TEXT,
  last_seen_at  TEXT,
  last_ip       TEXT
);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,
  sitting_id      TEXT NOT NULL REFERENCES sittings(id),
  student_id      TEXT NOT NULL REFERENCES students(id),
  seat            TEXT,
  token_hash      TEXT NOT NULL,
  seed            INTEGER NOT NULL,
  started_at      TEXT NOT NULL,
  ends_at         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'in_progress' 
                  CHECK (status IN ('in_progress','submitted','expired','reset')),
  submitted_at    TEXT,
  submit_reason   TEXT,
  last_seq        INTEGER NOT NULL DEFAULT 0,
  last_seen_at    TEXT,
  last_ip         TEXT,
  
  UNIQUE (sitting_id, student_id)
);

CREATE INDEX idx_sessions_sitting ON sessions(sitting_id, status);
CREATE INDEX idx_sessions_student ON sessions(student_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash) WHERE status = 'in_progress';
CREATE INDEX idx_sessions_seat ON sessions(seat) WHERE seat IS NOT NULL;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE answers (
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id   TEXT NOT NULL,
  answer_json   TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  saved_at      TEXT NOT NULL,
  
  PRIMARY KEY (session_id, question_id)
);

CREATE INDEX idx_answers_session ON answers(session_id);

-- Triggers for sequence enforcement
CREATE TRIGGER prevent_answer_rollback
BEFORE UPDATE ON answers
FOR EACH ROW
WHEN NEW.seq <= OLD.seq
BEGIN
  SELECT RAISE(IGNORE);  -- Reject updates with old sequence numbers
END;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE results (
  session_id    TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  score         REAL NOT NULL,
  max_score     REAL NOT NULL,
  percent       REAL NOT NULL,
  grade         TEXT,
  scored_at     TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE outbox (
  event_id        TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  acked_at        TEXT,
  error_msg       TEXT
);

CREATE INDEX idx_outbox_pending ON outbox(next_attempt_at, attempts) WHERE acked_at IS NULL;
CREATE INDEX idx_outbox_type ON outbox(type, created_at);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- last_cursor, last_sync_at, last_heartbeat_ok_at, clock_offset_ms

-- ─────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  detail_json TEXT
);

CREATE INDEX idx_audit_log_at ON audit_log(at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);

-- ─────────────────────────────────────────────────────────────

CREATE TABLE backup_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  path      TEXT NOT NULL,
  bytes     INTEGER,
  sha256    TEXT,
  ok        INTEGER NOT NULL
);

CREATE INDEX idx_backup_log_at ON backup_log(at DESC);
```

### 4.3 SQLite Optimization Tips

| Technique | Implementation |
|-----------|----------------|
| **Analyze regularly** | `PRAGMA optimize;` on startup and daily |
| **Incremental vacuum** | `PRAGMA incremental_vacuum(1000);` after large deletes |
| **Prepared statements** | Reuse statements with better-sqlite3 |
| **Batch writes** | Wrap multiple inserts in `BEGIN TRANSACTION` |
| **Index maintenance** | `ANALYZE;` after bulk imports |

---

## 5. Indexing Strategy

### 5.1 Index Design Principles

| Principle | Rule |
|-----------|------|
| **Query-driven** | Every index must serve a documented query pattern |
| **Selectivity first** | Index columns with high cardinality first |
| **Cover indexes** | Include query columns in index to avoid table lookups |
| **Partial indexes** | Use `WHERE` clauses to reduce index size |
| **Avoid over-indexing** | Each index slows writes; justify each one |

### 5.2 Query Pattern → Index Mapping

| Query Pattern | Index | Notes |
|---------------|-------|-------|
| Student search by name | `idx_students_name_search` (GIN on tsvector) | Full-text, handles typos with trigrams |
| Question bank filter | `idx_questions_school_subject` (school_id, subject_id, status) | Composite for drill-down |
| Parent portal dashboard | `idx_results_student_status` + materialized view | Hot path, must be <50ms |
| Teacher's class roster | `idx_enrolments_class` | Simple, high hit rate |
| Session resume lookup | `idx_sessions_token` (partial WHERE status='in_progress') | Only active sessions matter |
| Audit trail search | `idx_audit_logs_school_time` + partitioning | Time-range queries with school filter |
| Sync cursor pull | `idx_change_log_school_cursor` | Sequential scan, partition by month |
| Invitation cleanup | `idx_invitations_expires` (partial WHERE status IN (...)) | Background job, low priority |

### 5.3 Index Maintenance Schedule

```sql
-- Daily (automated)
ANALYZE;  -- PostgreSQL
PRAGMA optimize;  -- SQLite

-- Weekly
REINDEX INDEX idx_students_name_search;  -- GIN indexes benefit from periodic reindex
REFRESH MATERIALIZED VIEW CONCURRENTLY sitting_stats;

-- Monthly
VACUUM ANALYZE;  -- PostgreSQL
PRAGMA incremental_vacuum(10000);  -- SQLite
```

---

## 6. Query Optimization Patterns

### 6.1 N+1 Query Prevention

**Anti-pattern:**
```sql
-- Controller loads guardians
SELECT * FROM guardians WHERE school_id = $1;

-- Then loops to load children (N queries)
FOR EACH guardian:
  SELECT * FROM guardianships WHERE guardian_id = guardian.id;
```

**Solution: JOIN or CTEs**
```sql
SELECT 
  g.*,
  json_agg(json_build_object(
    'student_id', s.id,
    'student_name', s.first_name || ' ' || s.last_name,
    'relationship', gs.relationship
  )) AS children
FROM guardians g
LEFT JOIN guardianships gs ON gs.guardian_id = g.id
LEFT JOIN students s ON s.id = gs.student_id
WHERE g.school_id = $1
GROUP BY g.id;
```

### 6.2 Parent Portal: Optimized Child Dashboard

```sql
-- Single query: guardian → children → recent results
WITH guardian_students AS (
  SELECT gs.student_id, s.full_name, s.class_id
  FROM guardianships gs
  JOIN students s ON s.id = gs.student_id
  WHERE gs.guardian_id = $1 AND gs.can_view_results = TRUE
),
recent_results AS (
  SELECT 
    r.student_id,
    r.exam_id,
    e.title AS exam_title,
    r.score,
    r.max_score,
    r.percent,
    r.grade,
    r.released_at,
    ROW_NUMBER() OVER (PARTITION BY r.student_id ORDER BY r.released_at DESC) AS rn
  FROM results r
  JOIN exams e ON e.id = r.exam_id
  WHERE r.student_id IN (SELECT student_id FROM guardian_students)
    AND r.status = 'released'
)
SELECT 
  gs.student_id,
  gs.full_name,
  gs.class_id,
  json_agg(
    json_build_object(
      'exam_title', rr.exam_title,
      'score', rr.score,
      'percent', rr.percent,
      'grade', rr.grade,
      'released_at', rr.released_at
    ) ORDER BY rr.released_at DESC
  ) FILTER (WHERE rr.rn <= 5) AS recent_results,
  (SELECT AVG(percent) FROM recent_results WHERE student_id = gs.student_id) AS avg_percent
FROM guardian_students gs
LEFT JOIN recent_results rr ON rr.student_id = gs.student_id
GROUP BY gs.student_id, gs.full_name, gs.class_id;
```

### 6.3 Teacher Dashboard: Class Performance

```sql
-- Aggregate with window functions
SELECT 
  s.sitting_id,
  e.title,
  c.name AS class_name,
  s.window_start,
  COUNT(sub.id) AS total_attempts,
  COUNT(r.id) FILTER (WHERE r.status = 'released') AS released,
  AVG(r.percent) FILTER (WHERE r.status = 'released') AS avg_percent,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY r.percent) 
    FILTER (WHERE r.status = 'released') AS median_percent,
  MAX(r.percent) FILTER (WHERE r.status = 'released') AS top_score
FROM sittings s
JOIN exams e ON e.id = s.exam_id
JOIN classes c ON c.id = s.class_id
LEFT JOIN submissions sub ON sub.sitting_id = s.id
LEFT JOIN results r ON r.submission_id = sub.id
WHERE s.school_id = $1 
  AND s.status = 'closed'
  AND e.subject_id = $2  -- Teacher's assigned subject
GROUP BY s.id, e.title, c.name, s.window_start
ORDER BY s.window_start DESC
LIMIT 20;
```

### 6.4 Connection Pooling Configuration

**Cloud API (PostgreSQL):**
```typescript
// config/database.ts
export const pgPoolConfig = {
  max: 20,                    // Max connections per instance
  min: 5,                     // Minimum idle connections
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 5000,
  maxUses: 7500,              // Recycle connection after N queries
  application_name: 'cbt-cloud-api',
  statement_timeout: 30000,   // Kill queries running >30s
  idle_in_transaction_session_timeout: 60000
};
```

**School Server (SQLite):**
```typescript
// better-sqlite3 is synchronous, single connection
const db = new Database('school.db', {
  readonly: false,
  fileMustExist: true
});

db.pragma('journal_mode = WAL');
db.pragma('synchronous = FULL');
db.pragma('foreign_keys = ON');
```

---

## 7. Full-Text Search Implementation

### 7.1 PostgreSQL tsvector Strategy

**Questions:**
```sql
-- Already added in schema
ALTER TABLE questions ADD COLUMN content_search TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(stem,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(topic,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(explanation,'')), 'C')
  ) STORED;

CREATE INDEX idx_questions_content_search ON questions USING GIN(content_search);
```

**Query:**
```sql
SELECT 
  q.id,
  q.stem,
  q.topic,
  q.marks,
  ts_rank(q.content_search, query) AS rank
FROM questions q,
     to_tsquery('english', 'pythagoras & theorem') AS query
WHERE q.school_id = $1
  AND q.subject_id = $2
  AND q.status = 'approved'
  AND q.content_search @@ query
ORDER BY rank DESC
LIMIT 20;
```

### 7.2 Fuzzy Search with Trigrams

```sql
-- Find students with typos in name
SELECT 
  id,
  first_name,
  last_name,
  admission_no,
  similarity(first_name || ' ' || last_name, $1) AS sim
FROM students
WHERE school_id = $2
  AND (first_name || ' ' || last_name) % $1  -- % operator = similar to
ORDER BY sim DESC
LIMIT 10;

-- Example: searching "Adeymo" finds "Adeyemi"
```

---

## 8. Partitioning Strategy

### 8.1 Time-Series Partitioning (PostgreSQL 11+)

**Audit Logs (grows indefinitely):**
```sql
-- Convert to partitioned table
CREATE TABLE audit_logs_new (
  LIKE audit_logs INCLUDING ALL
) PARTITION BY RANGE (at);

-- Create monthly partitions
CREATE TABLE audit_logs_2026_10 PARTITION OF audit_logs_new
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE audit_logs_2026_11 PARTITION OF audit_logs_new
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

-- Automate partition creation (pg_cron or app-level)
-- DROP old partitions after retention period
DROP TABLE audit_logs_2024_01;  -- After 2 years
```

**Change Log:**
```sql
CREATE TABLE change_log_new (
  LIKE change_log INCLUDING ALL
) PARTITION BY RANGE (cursor);

-- Partition by 10M rows
CREATE TABLE change_log_000 PARTITION OF change_log_new
  FOR VALUES FROM (MINVALUE) TO (10000000);

CREATE TABLE change_log_010 PARTITION OF change_log_new
  FOR VALUES FROM (10000000) TO (20000000);
```

### 8.2 List Partitioning by School (Future)

```sql
-- If one school dominates (e.g., 80% of data)
CREATE TABLE submissions_new (
  LIKE submissions INCLUDING ALL
) PARTITION BY LIST (school_id);

CREATE TABLE submissions_school_large PARTITION OF submissions_new
  FOR VALUES IN ('school-uuid-1');

CREATE TABLE submissions_others PARTITION OF submissions_new
  DEFAULT;
```

---

## 9. Row-Level Security (RLS)

### 9.1 RLS Policies

```sql
-- Enable RLS on all tenant tables
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
-- ... (repeat for all tables with school_id)

-- Policy: Users only see their school's data
CREATE POLICY school_isolation ON students
  USING (school_id = current_setting('app.school_id')::TEXT);

CREATE POLICY school_isolation ON questions
  USING (school_id = current_setting('app.school_id')::TEXT);

-- Policy: Parents only see linked children's results
CREATE POLICY parent_view_results ON results
  USING (
    student_id IN (
      SELECT gs.student_id
      FROM guardianships gs
      JOIN guardians g ON g.id = gs.guardian_id
      WHERE g.user_id = current_setting('app.user_id')::TEXT
        AND gs.can_view_results = TRUE
    )
    AND status = 'released'
  );
```

### 9.2 Database Roles

```sql
-- Application role (limited)
CREATE ROLE cbt_app WITH LOGIN PASSWORD 'secure-generated-password';
GRANT CONNECT ON DATABASE cbt_cloud TO cbt_app;
GRANT USAGE ON SCHEMA public TO cbt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cbt_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cbt_app;

-- Audit role (insert-only)
CREATE ROLE cbt_audit WITH LOGIN PASSWORD 'another-secure-password';
GRANT INSERT ON audit_logs TO cbt_audit;
GRANT SELECT ON audit_logs TO cbt_audit;  -- For audit queries
REVOKE UPDATE, DELETE ON audit_logs FROM cbt_audit;

-- Platform owner role (bypasses RLS for cross-school queries)
CREATE ROLE cbt_platform WITH LOGIN PASSWORD 'platform-secure-password';
GRANT ALL PRIVILEGES ON DATABASE cbt_cloud TO cbt_platform;
ALTER TABLE students DISABLE ROW LEVEL SECURITY FOR ROLE cbt_platform;
```

### 9.3 Setting Session Variables

```typescript
// At request start (NestJS interceptor)
await db.execute(sql`SET LOCAL app.school_id = ${user.schoolId}`);
await db.execute(sql`SET LOCAL app.user_id = ${user.id}`);
await db.execute(sql`SET LOCAL app.role = ${user.role}`);
```

---

## 10. Connection Pooling & Performance

### 10.1 Cloud API Pool Tuning

```typescript
// Recommended settings for 2-core, 4GB server
const poolConfig = {
  max: Math.ceil(numCPUs * 2.5),  // ~5 for 2 cores
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  maxUses: 7500,
  
  // Per-connection settings
  statement_timeout: '30s',
  idle_in_transaction_session_timeout: '60s'
};
```

### 10.2 Query Performance Monitoring

```sql
-- Enable pg_stat_statements (postgresql.conf)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Find slow queries
SELECT 
  calls,
  mean_exec_time,
  max_exec_time,
  stddev_exec_time,
  query
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- >100ms average
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Find missing indexes
SELECT 
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  seq_tup_read / seq_scan AS avg_seq_read
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 20;
```

---

## 11. Backup & Recovery Strategy

### 11.1 PostgreSQL Backup

**Daily Full Backup:**
```bash
#!/bin/bash
# /opt/cbt/backup-cloud.sh
BACKUP_DIR=/var/backups/cbt
DATE=$(date +%Y%m%d)

pg_dump -Fc -Z9 cbt_cloud > "$BACKUP_DIR/cloud-$DATE.dump"
aws s3 cp "$BACKUP_DIR/cloud-$DATE.dump" s3://cbt-backups/cloud/

# Keep local backups for 7 days
find $BACKUP_DIR -name "cloud-*.dump" -mtime +7 -delete
```

**WAL Archiving (continuous):**
```ini
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://cbt-backups/wal/%f'
archive_timeout = 300  # Force switch every 5 minutes
```

**Point-in-Time Recovery:**
```bash
# Restore to specific time
pg_restore -C -d postgres cloud-20261014.dump
# Then replay WAL segments to target time
```

### 11.2 SQLite Backup (School Server)

**Automated Backup (every 15 min during exam, daily otherwise):**
```typescript
async function backupSchoolDatabase() {
  const backupPath = `C:\\ProgramData\\SchoolCBT\\backups\\school-${Date.now()}.db`;
  
  // SQLite VACUUM INTO (atomic, consistent backup)
  await db.prepare('VACUUM INTO ?').run(backupPath);
  
  // Verify backup
  const hash = await sha256File(backupPath);
  await db.prepare(
    'INSERT INTO backup_log(at, path, bytes, sha256, ok) VALUES (?, ?, ?, ?, 1)'
  ).run(new Date().toISOString(), backupPath, statSync(backupPath).size, hash);
  
  // Copy to second location
  await copyFile(backupPath, `D:\\CBT-Backups\\school-${Date.now()}.db`);
  
  // Keep 14 days local, 90 days on second drive
  await cleanupOldBackups();
}
```

---

## 12. Migration Strategy

### 12.1 Drizzle Migration Workflow

```bash
# Generate migration after schema changes
pnpm drizzle-kit generate:pg --schema=./src/db/schema.ts --out=./migrations

# Apply to dev
pnpm drizzle-kit push:pg

# Review generated SQL
cat migrations/0001_add_question_tags.sql

# Deploy to production (manual approval)
psql -U cbt_app -d cbt_cloud < migrations/0001_add_question_tags.sql
```

### 12.2 Zero-Downtime Migration Pattern

```sql
-- Step 1: Add new column (nullable)
ALTER TABLE questions ADD COLUMN tags TEXT[];

-- Step 2: Deploy code that writes to both old and new
-- (Application handles both states)

-- Step 3: Backfill data
UPDATE questions SET tags = string_to_array(topic, ',') WHERE tags IS NULL;

-- Step 4: Make NOT NULL (after verification)
ALTER TABLE questions ALTER COLUMN tags SET NOT NULL;

-- Step 5: Deploy code that only uses new column

-- Step 6: Drop old column
ALTER TABLE questions DROP COLUMN topic;
```

---

## 13. Monitoring & Maintenance

### 13.1 Health Checks

```sql
-- Database health
SELECT 
  numbackends AS active_connections,
  xact_commit AS transactions,
  blks_hit * 100.0 / (blks_hit + blks_read) AS cache_hit_ratio
FROM pg_stat_database
WHERE datname = 'cbt_cloud';

-- Table bloat
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
```

### 13.2 Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Connection pool usage | >70% | >90% |
| Slow query count (>1s) | >10/min | >50/min |
| Database size | >80% disk | >95% disk |
| Cache hit ratio | <90% | <80% |
| Replication lag | >30s | >2min |
| Failed logins | >20/min | >100/min |

---

## 14. Data Retention & Archival

### 14.1 Retention Policies

| Data Type | Retention | Archival Strategy |
|-----------|-----------|-------------------|
| Sessions (active) | Duration + 1 day | Delete on submission |
| Submissions | 3 years | Compress after 1 year |
| Answers (detailed) | 1 year | JSON to cold storage |
| Results (summary) | Indefinite | Keep forever |
| Audit logs | 2 years | Partition drop |
| Invitations | 90 days after expiry/use | Soft delete, then purge |
| Sessions (auth) | 7 days after expiry | Hard delete |
| Notifications | 90 days | Archive to S3, delete |

### 14.2 Archival Job (Monthly)

```sql
-- Archive old answers to JSONB file
COPY (
  SELECT 
    sa.submission_id,
    sa.question_id,
    sa.answer,
    sa.answered_at
  FROM submission_answers sa
  JOIN submissions s ON s.id = sa.submission_id
  WHERE s.submitted_at < NOW() - INTERVAL '1 year'
) TO '/backups/answers-archive-2025.jsonl' WITH (FORMAT 'json');

-- Delete archived rows
DELETE FROM submission_answers sa
USING submissions s
WHERE sa.submission_id = s.id
  AND s.submitted_at < NOW() - INTERVAL '1 year';

VACUUM FULL submission_answers;
```

---

## 15. Performance Benchmarks & SLAs

### 15.1 Target Performance

| Operation | Target | Measured With |
|-----------|--------|---------------|
| Student login (exam) | <200ms | School server, cold cache |
| Answer save | <50ms | School server, p95 |
| Parent dashboard load | <300ms | Cloud API, 3 children, 10 results each |
| Teacher question search | <150ms | Cloud API, 200 results |
| Exam pack download | <5s | 40 questions with images, 2MB |
| Result release (50 students) | <2s | Cloud API bulk operation |
| Sync batch (100 results) | <1s | Cloud API, accept + store |

### 15.2 Load Test Scenarios

**Exam Peak Load:**
- 200 concurrent students
- Answer save every 15 seconds
- 60-minute exam
- Expected: 13 writes/second, SQLite handles easily

**Cloud API Load:**
- 50 concurrent teachers
- 20 requests/min per teacher (browsing, editing)
- Expected: ~17 req/sec, pool of 10 connections

---

## Appendix A: Common Queries Library

```sql
-- A.1: Find duplicate students by name
SELECT 
  school_id,
  first_name,
  last_name,
  COUNT(*),
  array_agg(id) AS duplicate_ids
FROM students
GROUP BY school_id, first_name, last_name
HAVING COUNT(*) > 1;

-- A.2: Guardian with no active children
SELECT g.id, g.full_name, g.school_id
FROM guardians g
WHERE NOT EXISTS (
  SELECT 1 FROM guardianships gs
  JOIN students s ON s.id = gs.student_id
  WHERE gs.guardian_id = g.id AND s.status = 'active'
);

-- A.3: Questions never used in exams
SELECT q.id, q.stem, q.created_at
FROM questions q
WHERE q.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM exam_questions eq WHERE eq.question_id = q.id
  )
  AND q.created_at < NOW() - INTERVAL '6 months';

-- A.4: Schools approaching licence expiry
SELECT 
  id,
  name,
  licence_expires,
  licence_expires - CURRENT_DATE AS days_left
FROM schools
WHERE status = 'active'
  AND licence_expires < CURRENT_DATE + INTERVAL '30 days'
ORDER BY licence_expires;

-- A.5: Most active teachers (by questions created)
SELECT 
  u.full_name,
  u.email,
  COUNT(q.id) AS questions_created,
  COUNT(DISTINCT e.id) AS exams_created
FROM users u
LEFT JOIN questions q ON q.created_by = u.id
LEFT JOIN exams e ON e.created_by = u.id
WHERE u.role = 'teacher'
  AND u.school_id = $1
GROUP BY u.id, u.full_name, u.email
ORDER BY questions_created DESC
LIMIT 10;
```

---

## Appendix B: Schema Diff Checker

```sql
-- Ensure cloud and school databases stay in sync for shared entities
-- Run this query on both databases and compare

SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('students', 'classes', 'subjects', 'exams', 'sittings')
ORDER BY table_name, ordinal_position;
```

---

## Document Metadata

**Change Log:**

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-10-11 | Initial comprehensive schema |
| 1.1 | 2026-10-14 | Added optimization, indexing, partitioning, RLS, monitoring sections |

**Review Checklist:**

- [x] All tables from CBT-02-Data-Model.md included
- [x] Indexes justified with query patterns
- [x] Full-text search strategy defined
- [x] Partitioning plan for large tables
- [x] RLS policies for multi-tenancy
- [x] Backup & recovery procedures
- [x] Migration strategy documented
- [x] Performance benchmarks defined
- [x] SQLite optimization for school server
- [x] Connection pooling configured

**Next Documents:**
- CBT-06-Cloud-API-Implementation.md
- CBT-07-School-Server-Implementation.md
- CBT-08-DevOps-and-Deployment.md
