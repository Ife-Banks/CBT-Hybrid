# CBT Platform — Backend Build Phases (Legacy Document)

**⚠️ DEPRECATED:** This comprehensive document has been restructured into individual phase documents for better organization and usability.

**✅ NEW STRUCTURE:** Please use the individual phase documents listed below instead of this legacy file.

---

## Updated Documentation Structure

### Main Overview
- **[CBT-Build-Phases-Overview.md](CBT-Build-Phases-Overview.md)** - Complete roadmap, timeline, and phase dependencies

### Individual Phase Documents
- **[CBT-Phase-0-Foundation.md](CBT-Phase-0-Foundation.md)** - Project setup and development environment
- **[CBT-Phase-1-Infrastructure.md](CBT-Phase-1-Infrastructure.md)** - Core services and shared algorithms  
- **[CBT-Phase-2-Authentication.md](CBT-Phase-2-Authentication.md)** - Security and access control
- **[CBT-Phase-3-DataLayer.md](CBT-Phase-3-DataLayer.md)** - Database and ORM setup *(to be created)*
- **[CBT-Phase-4-UserManagement.md](CBT-Phase-4-UserManagement.md)** - User operations and roles *(to be created)*
- **[CBT-Phase-5-QuestionBank.md](CBT-Phase-5-QuestionBank.md)** - Question management system *(to be created)*
- **[CBT-Phase-6-ExamEngine.md](CBT-Phase-6-ExamEngine.md)** - Exam creation and delivery
- **[CBT-Phase-7-SchoolServer.md](CBT-Phase-7-SchoolServer.md)** - Offline exam platform *(to be created)*
- **[CBT-Phase-8-SyncSystem.md](CBT-Phase-8-SyncSystem.md)** - Bidirectional synchronization *(to be created)*
- **[CBT-Phase-9-Results.md](CBT-Phase-9-Results.md)** - Results processing and analytics *(to be created)*
- **[CBT-Phase-10-Production.md](CBT-Phase-10-Production.md)** - Monitoring and deployment *(to be created)*

### Benefits of New Structure

✅ **Focused Implementation**: Each phase has its own detailed story, prompts, and verification  
✅ **Independent Teams**: Multiple teams can work on different phases simultaneously  
✅ **Better Organization**: Easier to find specific implementation details  
✅ **Cleaner Documentation**: Each document is manageable and focused  
✅ **Version Control**: Individual phase updates don't affect other phases  

---

## Migration Guide

If you were using this legacy document:

1. **For Overview Information**: Use `CBT-Build-Phases-Overview.md` 
2. **For Specific Phase Work**: Use the individual `CBT-Phase-X-*.md` documents
3. **For Implementation**: Follow the detailed prompts in each phase document
4. **For Verification**: Use the independent verification prompts in each phase

---

## Legacy Content Status

The content from this document has been reorganized as follows:

| Original Section | New Location | Status |
|-----------------|--------------|---------|
| Implementation Overview | CBT-Build-Phases-Overview.md | ✅ Migrated |
| Phase 0: Foundation | CBT-Phase-0-Foundation.md | ✅ Complete |
| Phase 1: Infrastructure | CBT-Phase-1-Infrastructure.md | ✅ Complete |  
| Phase 2: Authentication | CBT-Phase-2-Authentication.md | ✅ Complete |
| Phase 3: Data Layer | CBT-Phase-3-DataLayer.md | ✅ Complete |
| Phase 4: User Management | CBT-Phase-4-UserManagement.md | ✅ Complete |
| Phase 5: Question Bank | CBT-Phase-5-QuestionBank.md | ✅ Complete |
| Phase 6: Exam Engine | CBT-Phase-6-ExamEngine.md | ✅ Complete |
| Phase 7: School Server | CBT-Phase-7-SchoolServer.md | ✅ Complete |
| Phase 8: Sync System | CBT-Phase-8-SyncSystem.md | ✅ Complete |
| Phase 9: Results | CBT-Phase-9-Results.md | ✅ Complete |
| Phase 10: Production | CBT-Phase-10-Production.md | ✅ Complete |

---

## 1. Implementation Overview

### 1.1 Build Strategy

The CBT Platform backend will be built in **10 progressive phases**, each with:
- **Clear deliverables** and acceptance criteria
- **Independent verification prompts** for quality assurance
- **Rollback points** if issues are discovered
- **Performance benchmarks** that must be met before proceeding

### 1.2 Phase Dependencies

```mermaid
graph TD
    P0[Phase 0: Foundation] --> P1[Phase 1: Infrastructure]
    P1 --> P2[Phase 2: Auth & Authorization]
    P1 --> P3[Phase 3: Data Layer]
    P2 --> P4[Phase 4: User Management]
    P3 --> P4
    P4 --> P5[Phase 5: Question Bank]
    P5 --> P6[Phase 6: Exam Engine]
    P6 --> P7[Phase 7: School Server]
    P7 --> P8[Phase 8: Sync System]
    P6 --> P9[Phase 9: Results & Analytics]
    P8 --> P9
    P9 --> P10[Phase 10: Production]
    
    style P0 fill:#e1f5fe
    style P1 fill:#f3e5f5
    style P2 fill:#e8f5e8
    style P10 fill:#fff3e0
```

### 1.3 Success Criteria

Each phase must meet these criteria before proceeding:
- ✅ **All unit tests pass** (>95% coverage for business logic)
- ✅ **Integration tests pass** (API endpoints, database operations)
- ✅ **Performance benchmarks met** (response times, throughput)
- ✅ **Security scan clean** (vulnerability assessment)
- ✅ **Code review approved** (architecture compliance, best practices)

---

## 2. Phase 0: Foundation & Setup

### 2.1 Phase Overview
**Duration:** 3-5 days  
**Goal:** Establish monorepo structure, tooling, and development environment  
**Prerequisites:** None  
**Team Size:** 1-2 developers  

### 2.2 Deliverables

| Item | Description | Status |
|------|-------------|---------|
| Monorepo Structure | Complete workspace with all apps/packages | ⏳ |
| Development Environment | Docker compose, scripts, IDE config | ⏳ |
| CI/CD Pipeline | GitHub Actions, linting, testing | ⏳ |
| Documentation Setup | README, contribution guidelines | ⏳ |

### 2.3 Implementation Guide

#### 2.3.1 Monorepo Setup Prompt

```markdown
## PROMPT: Phase 0.1 - Monorepo Structure

**TASK:** Create the complete monorepo structure for CBT Platform backend

**REQUIREMENTS:**
1. Use pnpm workspaces with the following structure:
   ```
   /
   ├── apps/
   │   ├── cloud-api/          # NestJS cloud backend
   │   ├── cloud-web/          # Next.js portals (placeholder)
   │   ├── school-server/      # NestJS school server
   │   ├── exam-client/        # React exam client (placeholder)
   │   └── installer/          # Windows installer (placeholder)
   ├── packages/
   │   ├── exam-core/          # Pure TypeScript algorithms
   │   ├── shared-types/       # Zod schemas and types
   │   ├── ui/                 # Design system (placeholder)
   │   ├── config/             # ESLint, TypeScript configs
   │   └── test-fixtures/      # Test utilities and fixtures
   ├── docs/                   # Architecture documents
   ├── docker/                 # Docker compose files
   └── .github/workflows/      # CI/CD workflows
   ```

2. Configure package.json with:
   - Workspace configuration
   - Scripts: dev, build, test, lint, typecheck
   - Dependencies: TypeScript, ESLint, Prettier, Vitest

3. Setup TypeScript project references between packages

4. Configure ESLint with:
   - @typescript-eslint/recommended
   - Strict rules for no-any, no-unused-vars
   - Import sorting rules

5. Setup Prettier with consistent formatting

**ACCEPTANCE CRITERIA:**
- `pnpm install` completes without errors
- `pnpm dev` starts all development processes
- `pnpm build` builds all apps successfully
- `pnpm test` runs (even if no tests exist yet)
- `pnpm lint` passes on all packages

**FILES TO CREATE:**
- package.json (root)
- pnpm-workspace.yaml
- turbo.json
- tsconfig.json (root + each app/package)
- .eslintrc.js
- .prettierrc
- Each app/package package.json with proper dependencies
```

#### 2.3.2 Development Environment Prompt

```markdown
## PROMPT: Phase 0.2 - Development Environment

**TASK:** Setup containerized development environment with all required services

**REQUIREMENTS:**
1. Create docker-compose.dev.yml with:
   - PostgreSQL 15 with extensions (uuid-ossp, citext, pg_trgm, btree_gin)
   - Redis 7 for caching and job queues
   - MinIO for S3-compatible object storage
   - Mailpit for email testing
   - Adminer for database management

2. Database initialization:
   - Create cbt_cloud database
   - Setup database users with proper permissions
   - Load required extensions

3. Development scripts:
   - scripts/dev-setup.sh - Initial environment setup
   - scripts/dev-start.sh - Start all services
   - scripts/dev-clean.sh - Clean volumes and restart

4. IDE configuration:
   - .vscode/settings.json with recommended extensions
   - .vscode/tasks.json for common development tasks
   - .vscode/launch.json for debugging configurations

**ACCEPTANCE CRITERIA:**
- `pnpm dev:setup` initializes complete development environment
- `pnpm dev:start` starts all services and they're accessible
- `pnpm dev:clean` resets environment to clean state
- Database connections work from apps
- Redis connections work
- MinIO S3 API is accessible
- All services have health check endpoints

**ENVIRONMENT VARIABLES:**
- Create .env.example with all required variables
- Document each variable's purpose
- Include safe defaults for development

**FILES TO CREATE:**
- docker-compose.dev.yml
- docker/postgres/init.sql
- docker/postgres/extensions.sql
- scripts/dev-setup.sh
- scripts/dev-start.sh
- scripts/dev-clean.sh
- .env.example
- .vscode/settings.json
- .vscode/tasks.json
- .vscode/launch.json
```

#### 2.3.3 CI/CD Pipeline Prompt

```markdown
## PROMPT: Phase 0.3 - CI/CD Pipeline Setup

**TASK:** Create comprehensive GitHub Actions workflows for automated testing and deployment

**REQUIREMENTS:**
1. Main CI workflow (.github/workflows/ci.yml):
   - Trigger on: push, pull_request to main/develop
   - Jobs: lint, typecheck, test, build
   - Matrix strategy for Node.js versions (18, 20)
   - Cache pnpm dependencies
   - Run security audit
   - Generate test coverage reports

2. Security workflow (.github/workflows/security.yml):
   - Run CodeQL analysis
   - Dependency vulnerability scan
   - License compliance check
   - SAST (Static Application Security Testing)

3. Release workflow (.github/workflows/release.yml):
   - Trigger on version tags
   - Build production Docker images
   - Push to container registry
   - Create GitHub release with changelog

4. Database migration workflow:
   - Test migrations on clean database
   - Rollback testing
   - Schema validation

**ACCEPTANCE CRITERIA:**
- CI pipeline passes on sample code
- All jobs run in parallel where possible
- Artifacts are properly cached
- Security scans complete without critical issues
- Pipeline fails appropriately on test failures
- Build artifacts are stored for deployment

**QUALITY GATES:**
- Code coverage >80% (will increase to >95% in later phases)
- No ESLint errors or warnings
- No TypeScript errors
- All tests passing
- Security scan passes
- Build completes successfully

**FILES TO CREATE:**
- .github/workflows/ci.yml
- .github/workflows/security.yml
- .github/workflows/release.yml
- .github/workflows/migration-test.yml
- .github/dependabot.yml (automated dependency updates)
```

### 2.4 Verification Prompts

#### 2.4.1 Foundation Verification

```markdown
## VERIFICATION PROMPT: Phase 0 Complete

**TASK:** Verify that Phase 0 foundation is properly implemented and ready for Phase 1

**VERIFICATION CHECKLIST:**

### 1. Repository Structure Verification
- [ ] Clone repository to fresh directory
- [ ] Run `pnpm install` - should complete without errors
- [ ] Verify all workspace packages are linked correctly
- [ ] Check TypeScript project references work across packages

### 2. Development Environment Verification
- [ ] Run `pnpm dev:setup` on clean machine (or fresh container)
- [ ] Verify all Docker services start and are healthy
- [ ] Test database connection: `psql postgresql://cbt_app:password@localhost:5432/cbt_cloud`
- [ ] Test Redis connection: `redis-cli -h localhost -p 6379 ping`
- [ ] Test MinIO access: upload and download test file
- [ ] Access Mailpit web interface at http://localhost:8025

### 3. Build System Verification
- [ ] Run `pnpm lint` - should pass with no errors
- [ ] Run `pnpm typecheck` - should pass with no errors
- [ ] Run `pnpm test` - should run test runner (even if no tests)
- [ ] Run `pnpm build` - should build all packages successfully
- [ ] Verify built artifacts are in correct locations

### 4. CI/CD Verification
- [ ] Create test PR with intentional linting error - CI should fail
- [ ] Create test PR with clean code - CI should pass
- [ ] Verify all CI jobs run in reasonable time (<10 minutes total)
- [ ] Check security workflow runs without critical findings
- [ ] Verify dependency caching works (subsequent runs faster)

### 5. Documentation Verification
- [ ] README includes clear setup instructions
- [ ] All scripts have helpful descriptions
- [ ] Environment variables are documented
- [ ] Architecture documents are accessible and up-to-date

### 6. Performance Verification
- [ ] `pnpm install` completes in <2 minutes
- [ ] `pnpm dev:start` starts all services in <30 seconds
- [ ] Hot reload works in development
- [ ] Build time is <1 minute for incremental changes

**PHASE 0 COMPLETION CRITERIA:**
✅ All verification items pass
✅ Documentation is complete and accurate
✅ Development workflow is smooth and fast
✅ CI/CD pipeline is reliable
✅ Team can onboard new developers quickly

**ROLLBACK CONDITIONS:**
❌ Critical services fail to start reliably
❌ CI/CD pipeline has frequent failures
❌ Build times are excessive (>5 minutes full build)
❌ Development setup is complex or error-prone
```

### 2.5 Phase 0 Troubleshooting Guide

#### Common Issues and Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| pnpm workspace issues | Packages not linking correctly | Check pnpm-workspace.yaml syntax, run `pnpm install --force` |
| Docker services failing | Containers exit immediately | Check docker-compose logs, verify port conflicts |
| TypeScript errors | Cross-package imports failing | Verify tsconfig project references, check path mappings |
| ESLint conflicts | Rules conflicting between packages | Consolidate ESLint config in packages/config |
| CI/CD timeouts | Jobs taking too long | Optimize caching, parallelize jobs, reduce test scope |

#### Performance Optimization Tips

1. **pnpm Configuration:**
   ```ini
   # .npmrc
   auto-install-peers=true
   prefer-frozen-lockfile=true
   registry=https://registry.npmjs.org/
   ```

2. **Docker Optimization:**
   ```yaml
   # Use bind mounts for faster development
   volumes:
     - ./apps/cloud-api:/app/apps/cloud-api:cached
   ```

3. **TypeScript Performance:**
   ```json
   {
     "compilerOptions": {
       "incremental": true,
       "skipLibCheck": true
     }
   }
   ```
---

## 3. Phase 1: Core Infrastructure

### 3.1 Phase Overview
**Duration:** 5-7 days  
**Goal:** Build foundational infrastructure services and utilities  
**Prerequisites:** Phase 0 complete  
**Team Size:** 2-3 developers  

### 3.2 Deliverables

| Item | Description | Status |
|------|-------------|---------|
| Cloud API Foundation | NestJS app with basic structure | ⏳ |
| School Server Foundation | NestJS app with basic structure | ⏳ |
| Shared Core Algorithms | exam-core package with utilities | ⏳ |
| Configuration System | Environment config with validation | ⏳ |
| Logging Infrastructure | Structured logging with correlation | ⏳ |
| Error Handling | Global error handling and monitoring | ⏳ |
| Health Checks | Service health monitoring | ⏳ |

### 3.3 Implementation Guide

#### 3.3.1 Cloud API Foundation Prompt

```markdown
## PROMPT: Phase 1.1 - Cloud API Foundation

**TASK:** Create the foundational NestJS application for the cloud API with proper structure and middleware

**REQUIREMENTS:**

1. **NestJS Application Setup:**
   ```typescript
   // apps/cloud-api/src/main.ts
   - Bootstrap NestJS app with global configuration
   - Setup CORS with secure defaults
   - Configure request size limits
   - Add security middleware (helmet, rate limiting)
   - Setup graceful shutdown handling
   ```

2. **Module Structure:**
   ```
   apps/cloud-api/src/
   ├── main.ts                 # App bootstrap
   ├── app.module.ts          # Root module
   ├── common/                # Shared utilities
   │   ├── config/            # Configuration service
   │   ├── guards/            # Authentication guards
   │   ├── pipes/             # Validation pipes
   │   ├── filters/           # Exception filters
   │   ├── interceptors/      # Logging/transform interceptors
   │   └── decorators/        # Custom decorators
   ├── modules/               # Feature modules
   │   └── health/            # Health check module
   └── shared/               # Shared services
       ├── database/         # Database connection
       ├── cache/           # Redis cache service
       └── logger/          # Logging service
   ```

3. **Configuration Service:**
   - Use Zod schemas for config validation
   - Environment-specific configurations
   - Type-safe config access throughout app
   - Fail fast on invalid configuration

4. **Global Middleware Stack:**
   - Request correlation ID generation
   - Structured request/response logging
   - Error boundary with proper error codes
   - Request validation with detailed errors
   - API versioning support

5. **Health Check System:**
   - Database connectivity check
   - Redis connectivity check
   - External service dependency checks
   - Memory and CPU utilization
   - Custom business logic health checks

**PERFORMANCE REQUIREMENTS:**
- App startup time: <5 seconds
- Health check response: <100ms
- Memory usage: <200MB at startup
- Handle 1000 concurrent requests

**SECURITY REQUIREMENTS:**
- No sensitive data in logs
- Request size limits (10MB max)
- Rate limiting (100 req/min per IP by default)
- Secure headers (HSTS, CSP, etc.)
- Input sanitization and validation

**FILES TO CREATE:**
- apps/cloud-api/src/main.ts
- apps/cloud-api/src/app.module.ts
- apps/cloud-api/src/common/config/config.service.ts
- apps/cloud-api/src/common/config/config.schema.ts
- apps/cloud-api/src/common/filters/http-exception.filter.ts
- apps/cloud-api/src/common/interceptors/logging.interceptor.ts
- apps/cloud-api/src/common/pipes/validation.pipe.ts
- apps/cloud-api/src/modules/health/health.controller.ts
- apps/cloud-api/src/modules/health/health.service.ts
- apps/cloud-api/src/shared/logger/logger.service.ts

**TESTING REQUIREMENTS:**
- Unit tests for all services (>95% coverage)
- Integration tests for health endpoints
- Load test configuration endpoints
- Error handling tests for invalid configs
```

#### 3.3.2 Exam Core Algorithms Prompt

```markdown
## PROMPT: Phase 1.2 - Exam Core Algorithms Package

**TASK:** Implement the core algorithms package with student codes, shuffling, and marking logic

**REQUIREMENTS:**

1. **Student Code Generation & Validation:**
   ```typescript
   // packages/exam-core/src/student-codes/
   export class StudentCodeGenerator {
     generateBody(): string;           // 8 chars from safe alphabet
     computeCheckCharacter(body: string): string;
     formatCode(schoolCode: string, body: string): string;
     validateCode(code: string): boolean;
     parseCode(code: string): { school: string, body: string, check: string };
   }
   ```

2. **Deterministic Shuffling:**
   ```typescript
   // packages/exam-core/src/shuffle/
   export class DeterministicShuffler {
     constructor(seed: number);
     shuffle<T>(array: T[]): T[];
     static generateQuestionOrder(questions: Question[], sessionId: string): Question[];
     static generateOptionOrder(options: Option[], questionId: string, sessionSeed: number): Option[];
   }
   ```

3. **Answer Marking Engine:**
   ```typescript
   // packages/exam-core/src/marking/
   export class MarkingEngine {
     markSingleChoice(answer: SingleChoiceAnswer, key: SingleChoiceKey): number;
     markMultipleChoice(answer: MultipleChoiceAnswer, key: MultipleChoiceKey): number;
     markFillBlank(answer: FillBlankAnswer, key: FillBlankKey): number;
     markSession(answers: AnswerMap, keys: KeyMap): SessionResult;
   }
   ```

4. **Cryptographic Utilities:**
   ```typescript
   // packages/exam-core/src/crypto/
   export class ExamCrypto {
     generateExamKey(): string;        // 6-digit exam key
     hashExamKey(sittingId: string, key: string): string;
     signPackManifest(manifest: PackManifest, privateKey: string): string;
     verifyPackSignature(manifest: PackManifest, signature: string, publicKey: string): boolean;
     encryptAnswerKeys(keys: AnswerKeys, deviceSecret: string): EncryptedKeys;
     decryptAnswerKeys(encrypted: EncryptedKeys, deviceSecret: string): AnswerKeys;
   }
   ```

5. **Pack Format Utilities:**
   ```typescript
   // packages/exam-core/src/packs/
   export class PackBuilder {
     buildManifest(exam: Exam, questions: Question[]): PackManifest;
     validatePackStructure(packData: PackData): ValidationResult;
     buildPackageFile(manifest: PackManifest, assets: AssetMap): PackageFile;
   }
   ```

**ALGORITHM REQUIREMENTS:**
- All algorithms must be deterministic (same input = same output)
- Performance: handle 1000 questions in <100ms
- Memory efficient: process large datasets without excessive memory
- Pure functions where possible (no side effects)

**TEST VECTORS REQUIRED:**
Implement exactly these test cases from CBT-04-Build-Specification.md section 4:
- Student code: body "7K2M9QXD" → check "G" → full code "7K2M9QXDG"
- Mulberry32(12345) → first outputs: 4207900869, 1317490944, 2079646450
- shuffle(['A','B','C','D','E','F','G','H','I','J'], 12345) → "GEIABHFDCJ"
- Marking vectors: single_choice correct → 2 marks, wrong → 0 marks

**FILES TO CREATE:**
- packages/exam-core/src/student-codes/generator.ts
- packages/exam-core/src/student-codes/validator.ts
- packages/exam-core/src/shuffle/mulberry32.ts
- packages/exam-core/src/shuffle/deterministic-shuffler.ts
- packages/exam-core/src/marking/marking-engine.ts
- packages/exam-core/src/marking/answer-types.ts
- packages/exam-core/src/crypto/exam-crypto.ts
- packages/exam-core/src/packs/pack-builder.ts
- packages/exam-core/src/packs/pack-validator.ts
- packages/exam-core/src/index.ts (barrel exports)

**TESTING REQUIREMENTS:**
- 100% test coverage (pure algorithms)
- Property-based tests for generators
- Performance benchmarks for each algorithm
- Cross-validation with specification test vectors
```

#### 3.3.3 Shared Types Package Prompt

```markdown
## PROMPT: Phase 1.3 - Shared Types Package

**TASK:** Create comprehensive Zod schemas and TypeScript types for the entire platform

**REQUIREMENTS:**

1. **API Request/Response Types:**
   ```typescript
   // packages/shared-types/src/api/
   - Authentication schemas (login, register, tokens)
   - User management schemas (users, roles, permissions)
   - Student schemas (create, update, codes)
   - Question schemas (all question types, options)
   - Exam schemas (create, update, publish)
   - Results schemas (submissions, marks, grades)
   ```

2. **Database Entity Types:**
   ```typescript
   // packages/shared-types/src/entities/
   - All table schemas matching CBT-Database-Architecture.md
   - Relationship types and foreign keys
   - Enum types for status fields
   - Timestamp and UUID types
   ```

3. **Business Logic Types:**
   ```typescript
   // packages/shared-types/src/business/
   - Exam session states and transitions
   - Answer types for different question types
   - Marking results and grade calculations
   - Sync event payloads and statuses
   ```

4. **Configuration Schemas:**
   ```typescript
   // packages/shared-types/src/config/
   - Environment configuration validation
   - Feature flags and toggles
   - Database connection configurations
   - External service configurations
   ```

5. **Error Types:**
   ```typescript
   // packages/shared-types/src/errors/
   export const ERROR_CODES = {
     // Authentication errors
     INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
     ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
     // ... all error codes from API spec section 2
   } as const;
   
   export type ErrorCode = keyof typeof ERROR_CODES;
   ```

**VALIDATION REQUIREMENTS:**
- Every API endpoint must have request/response schemas
- All database operations use validated types
- Runtime validation with helpful error messages
- Type inference for excellent DX

**SCHEMA ORGANIZATION:**
```
packages/shared-types/src/
├── api/              # API request/response schemas
│   ├── auth.ts
│   ├── users.ts
│   ├── students.ts
│   ├── questions.ts
│   ├── exams.ts
│   └── results.ts
├── entities/         # Database entity schemas
│   ├── user.entity.ts
│   ├── student.entity.ts
│   ├── question.entity.ts
│   └── exam.entity.ts
├── business/         # Business logic types
│   ├── exam-session.ts
│   ├── answer-types.ts
│   └── sync-events.ts
├── config/          # Configuration schemas
│   ├── database.config.ts
│   ├── redis.config.ts
│   └── app.config.ts
├── errors/          # Error definitions
│   └── error-codes.ts
└── index.ts         # Barrel exports
```

**FILES TO CREATE:**
- All schema files listed above
- Comprehensive JSDoc documentation
- Example usage in README
- Type guards and utility functions

**TESTING REQUIREMENTS:**
- Schema validation tests with valid/invalid inputs
- Type inference tests (compile-time validation)
- Performance tests for complex nested schemas
- Documentation examples that actually compile
```

### 3.4 Verification Prompts

#### 3.4.1 Infrastructure Verification

```markdown
## VERIFICATION PROMPT: Phase 1 Complete

**TASK:** Verify that Phase 1 core infrastructure is properly implemented and meets performance requirements

**VERIFICATION CHECKLIST:**

### 1. Cloud API Foundation Verification
- [ ] Start cloud API: `cd apps/cloud-api && pnpm start:dev`
- [ ] API responds at http://localhost:3000
- [ ] Health check endpoint returns 200: `curl http://localhost:3000/health`
- [ ] Health check includes all service statuses (db, redis, etc.)
- [ ] Invalid routes return proper 404 with error format
- [ ] Request correlation IDs appear in logs
- [ ] Rate limiting works: send 101 requests in 1 minute, expect 429

### 2. School Server Foundation Verification
- [ ] Start school server: `cd apps/school-server && pnpm start:dev`
- [ ] Server responds at http://localhost:8080
- [ ] Health check endpoint returns 200
- [ ] SQLite database connects successfully
- [ ] File system access works for pack storage

### 3. Exam Core Algorithms Verification
- [ ] Run test vectors: `cd packages/exam-core && pnpm test`
- [ ] Student code generation produces valid codes
- [ ] Student code validation catches all error cases:
  - Wrong check character: "GRA-7K2M9QXDH" → invalid
  - Swapped characters: "GRA-7K2M9QDXG" → invalid  
  - Invalid characters: "GRA-7K2M9QXD0" → invalid
- [ ] Deterministic shuffle produces expected results:
  - mulberry32(12345) → [4207900869, 1317490944, 2079646450]
  - shuffle(['A','B','C','D','E','F','G','H','I','J'], 12345) → "GEIABHFDCJ"
- [ ] Marking engine handles all question types correctly
- [ ] Performance benchmarks pass:
  - Generate 1000 student codes: <100ms
  - Shuffle 100 questions: <10ms
  - Mark 100 answers: <50ms

### 4. Shared Types Verification
- [ ] Import all schemas: `import * from '@cbt/shared-types'`
- [ ] TypeScript compilation succeeds with strict mode
- [ ] Runtime validation works for sample data
- [ ] Error types match API specification exactly
- [ ] Generated types have proper JSDoc documentation

### 5. Configuration System Verification
- [ ] Invalid configuration fails app startup
- [ ] All required environment variables documented
- [ ] Configuration loads from .env files correctly
- [ ] Type safety prevents access to undefined config values

### 6. Logging System Verification
- [ ] Structured logs include correlation IDs
- [ ] Log levels filter correctly (debug, info, warn, error)
- [ ] Sensitive data is not logged (passwords, tokens)
- [ ] Request/response logging works without performance impact
- [ ] Log format is valid JSON for parsing

### 7. Error Handling Verification
- [ ] Unhandled exceptions return proper error format
- [ ] Database errors are handled gracefully
- [ ] Validation errors include field-level details
- [ ] Error responses match API specification format
- [ ] Internal errors don't leak sensitive information

### 8. Performance Verification
- [ ] Cloud API startup time: <5 seconds
- [ ] School server startup time: <3 seconds
- [ ] Health check response time: <100ms
- [ ] Memory usage at idle: <200MB per service
- [ ] Handle 100 concurrent health checks without errors

**PHASE 1 COMPLETION CRITERIA:**
✅ All services start and respond correctly
✅ All test vectors pass exactly as specified
✅ Performance benchmarks are met
✅ Configuration system is robust and type-safe
✅ Error handling is comprehensive and secure
✅ Logging provides useful debugging information

**ROLLBACK CONDITIONS:**
❌ Any test vector fails
❌ Performance requirements not met
❌ Services crash under normal load
❌ Configuration system allows invalid states
❌ Critical security issues in error handling
```
---

## 4. Phase 2: Authentication & Authorization

### 4.1 Phase Overview
**Duration:** 7-10 days  
**Goal:** Implement secure authentication and role-based authorization system  
**Prerequisites:** Phase 1 complete  
**Team Size:** 2-3 developers (1 security-focused)  

### 4.2 Deliverables

| Item | Description | Status |
|------|-------------|---------|
| Authentication Service | Multi-factor auth with risk assessment | ⏳ |
| Authorization Engine | Role-based permissions with CASL | ⏳ |
| Session Management | Secure session handling and cleanup | ⏳ |
| Password Security | Argon2id hashing with secure policies | ⏳ |
| TOTP Implementation | Two-factor authentication support | ⏳ |
| Security Middleware | Guards, rate limiting, audit logging | ⏳ |

### 4.3 Implementation Guide

#### 4.3.1 Authentication Service Prompt

```markdown
## PROMPT: Phase 2.1 - Advanced Authentication Service

**TASK:** Implement comprehensive authentication service with multi-factor support and risk assessment

**REQUIREMENTS:**

1. **Core Authentication Service:**
   ```typescript
   // apps/cloud-api/src/modules/auth/auth.service.ts
   export class AuthService {
     async authenticate(credentials: AuthCredentials, context: AuthContext): Promise<AuthResult>;
     async validatePassword(password: string, hash: string): Promise<boolean>;
     async hashPassword(password: string): Promise<string>;
     async generateTokens(user: User, context: AuthContext): Promise<TokenPair>;
     async refreshTokens(refreshToken: string): Promise<TokenPair>;
     async revokeToken(token: string): Promise<void>;
     async revokeAllUserTokens(userId: string): Promise<void>;
   }
   ```

2. **Password Security:**
   - Use Argon2id with proper parameters (m=19456, t=2, p=1)
   - Password strength validation (min 10 chars, complexity rules)
   - Prevent common passwords and user data reuse
   - Timing attack protection (constant-time comparison)

3. **Risk Assessment Engine:**
   ```typescript
   // apps/cloud-api/src/modules/auth/risk-assessment.service.ts
   export class RiskAssessmentService {
     async calculateRisk(credentials: AuthCredentials, context: AuthContext): Promise<number>;
     private async assessGeographicRisk(userId: string, ip: string): Promise<number>;
     private async assessDeviceRisk(userId: string, userAgent: string): Promise<number>;
     private async assessBehavioralRisk(userId: string, context: AuthContext): Promise<number>;
     private async assessTemporalRisk(userId: string, timestamp: Date): Promise<number>;
   }
   ```

4. **Multi-Factor Authentication:**
   ```typescript
   // apps/cloud-api/src/modules/auth/mfa.service.ts
   export class MFAService {
     async setupTOTP(userId: string): Promise<{ secret: string; qrCode: string; }>;
     async enableTOTP(userId: string, secret: string, token: string): Promise<string[]>; // recovery codes
     async verifyTOTP(userId: string, token: string): Promise<boolean>;
     async verifyRecoveryCode(userId: string, code: string): Promise<boolean>;
     async disableTOTP(userId: string, password: string, token: string): Promise<void>;
   }
   ```

5. **Session Management:**
   ```typescript
   // apps/cloud-api/src/modules/auth/session.service.ts
   export class SessionService {
     async createSession(user: User, context: AuthContext): Promise<Session>;
     async validateSession(sessionId: string): Promise<Session | null>;
     async extendSession(sessionId: string): Promise<void>;
     async revokeSession(sessionId: string): Promise<void>;
     async cleanupExpiredSessions(): Promise<number>; // returns count cleaned
   }
   ```

**SECURITY REQUIREMENTS:**
- Protection against timing attacks
- Rate limiting: 5 failed attempts lock account for 15 minutes
- Session tokens: cryptographically secure random, 256-bit
- JWT tokens: short-lived (15 minutes) with refresh capability
- Password reset: secure token generation with expiration
- Account lockout: progressive delays for repeated failures

**PERFORMANCE REQUIREMENTS:**
- Authentication response time: <200ms (95th percentile)
- Password hashing time: 200-500ms (tunable)
- Session validation: <50ms
- Risk assessment: <100ms
- Token generation: <10ms

**FILES TO CREATE:**
- apps/cloud-api/src/modules/auth/auth.module.ts
- apps/cloud-api/src/modules/auth/auth.controller.ts
- apps/cloud-api/src/modules/auth/auth.service.ts
- apps/cloud-api/src/modules/auth/mfa.service.ts
- apps/cloud-api/src/modules/auth/session.service.ts
- apps/cloud-api/src/modules/auth/risk-assessment.service.ts
- apps/cloud-api/src/modules/auth/password.service.ts
- apps/cloud-api/src/common/guards/auth.guard.ts
- apps/cloud-api/src/common/guards/mfa.guard.ts
- apps/cloud-api/src/common/decorators/roles.decorator.ts

**TESTING REQUIREMENTS:**
- Unit tests: >95% coverage
- Authentication flow integration tests
- Rate limiting tests
- Security tests (timing attacks, brute force)
- Load tests (1000 concurrent authentications)
```

#### 4.3.2 Authorization Engine Prompt

```markdown
## PROMPT: Phase 2.2 - Role-Based Authorization Engine

**TASK:** Implement fine-grained authorization system using CASL with role-based permissions

**REQUIREMENTS:**

1. **Permission Engine:**
   ```typescript
   // apps/cloud-api/src/modules/auth/permission.service.ts
   export class PermissionService {
     async buildUserAbilities(user: User): Promise<Ability>;
     async checkPermission(user: User, action: string, subject: any): Promise<boolean>;
     async filterByPermissions<T>(user: User, items: T[], action: string): Promise<T[]>;
     private async getTeacherAssignments(userId: string): Promise<Assignment[]>;
     private async getGuardianLinks(userId: string): Promise<GuardianLink[]>;
   }
   ```

2. **Role Definitions:**
   ```typescript
   // Platform Owner: manage all schools, create schools, global settings
   // School Admin: manage school users, students, exams, results within school
   // Teacher: manage assigned classes/subjects, create questions/exams for subjects
   // Class Teacher: additional permissions for assigned class (result release)
   // Parent: view linked children's data (results, basic info)
   // Bursar: manage fees for school (Phase 2)
   ```

3. **Permission Matrix Implementation:**
   ```typescript
   // Based on CBT-Backend-Architecture.md section 4.2
   // Each role has specific abilities for each resource type
   // Scoping by school_id, teacher assignments, guardian links
   // Dynamic permissions based on business rules
   ```

4. **Authorization Guards:**
   ```typescript
   // apps/cloud-api/src/common/guards/permissions.guard.ts
   @Injectable()
   export class PermissionsGuard implements CanActivate {
     async canActivate(context: ExecutionContext): Promise<boolean>;
     private extractPermissionRequirement(handler: Function): PermissionRequirement;
   }
   
   // apps/cloud-api/src/common/decorators/require-permission.decorator.ts
   export const RequirePermission = (action: string, subject: string) => { /* ... */ };
   ```

5. **Permission Caching:**
   ```typescript
   // Cache user abilities for performance
   // Invalidate cache on role/assignment changes
   // TTL-based cache with Redis backing
   // Cache key: user_id + updated_at timestamp
   ```

**PERMISSION EXAMPLES:**
```typescript
// Teachers can manage questions in their subjects
builder.can('manage', 'Question', { 
  subject_id: { $in: userSubjects },
  $or: [
    { created_by: user.id },
    { status: 'approved' }
  ]
});

// Parents can only view released results of linked children
builder.can('read', 'Result', {
  student_id: { $in: linkedStudentIds },
  status: 'released'
});

// School admins can manage everything in their school
builder.can('manage', 'all', { school_id: user.school_id });
```

**FILES TO CREATE:**
- apps/cloud-api/src/modules/auth/permission.service.ts
- apps/cloud-api/src/modules/auth/ability.factory.ts
- apps/cloud-api/src/common/guards/permissions.guard.ts
- apps/cloud-api/src/common/decorators/require-permission.decorator.ts
- apps/cloud-api/src/common/types/permissions.types.ts

**TESTING REQUIREMENTS:**
- Permission matrix tests (every role × resource combination)
- Scoping tests (users only see their data)
- Cache invalidation tests
- Performance tests (permission checks <10ms)
```

#### 4.3.3 Security Middleware Prompt

```markdown
## PROMPT: Phase 2.3 - Security Middleware & Rate Limiting

**TASK:** Implement comprehensive security middleware including rate limiting, audit logging, and security headers

**REQUIREMENTS:**

1. **Rate Limiting Service:**
   ```typescript
   // apps/cloud-api/src/common/guards/rate-limit.guard.ts
   export class RateLimitGuard implements CanActivate {
     // Different limits for different endpoints:
     // - Authentication: 10/min per IP, 5 failed per account
     // - API calls: 300/min per user
     // - File uploads: 10/hour per user
     // - Password reset: 3/hour per account
   }
   ```

2. **Audit Logging Service:**
   ```typescript
   // apps/cloud-api/src/modules/audit/audit.service.ts
   export class AuditService {
     async logAction(action: AuditAction): Promise<void>;
     async logSecurityEvent(event: SecurityEvent): Promise<void>;
     async logDataAccess(access: DataAccessEvent): Promise<void>;
     
     // Audit all: authentication, authorization failures, data changes,
     // privileged operations, configuration changes
   }
   ```

3. **Security Headers Middleware:**
   ```typescript
   // Security headers: HSTS, CSP, X-Frame-Options, etc.
   // CORS configuration for different environments
   // Request size limits and timeout handling
   // IP allowlist/blocklist support
   ```

4. **Input Validation & Sanitization:**
   ```typescript
   // apps/cloud-api/src/common/pipes/security-validation.pipe.ts
   export class SecurityValidationPipe implements PipeTransform {
     // SQL injection prevention
     // XSS prevention
     // File upload validation
     // Request size validation
   }
   ```

5. **Correlation ID Middleware:**
   ```typescript
   // Generate unique request IDs for tracing
   // Include in all logs and error responses
   // Forward to downstream services
   // Support for distributed tracing
   ```

**RATE LIMITING STRATEGY:**
```typescript
// Different strategies for different resources
interface RateLimitConfig {
  windowMs: number;        // Time window
  max: number;            // Max requests per window
  keyGenerator: Function;  // How to identify unique users
  skipIf: Function;       // Skip rate limiting conditions
  onLimitReached: Function; // Custom action when limit hit
}

// Examples:
// Auth endpoints: 10/min per IP + 5 failed per account
// API endpoints: 300/min per authenticated user
// File uploads: 10/hour per user
// Public endpoints: 1000/min per IP
```

**FILES TO CREATE:**
- apps/cloud-api/src/common/guards/rate-limit.guard.ts
- apps/cloud-api/src/common/middleware/security-headers.middleware.ts
- apps/cloud-api/src/common/middleware/correlation-id.middleware.ts
- apps/cloud-api/src/common/pipes/security-validation.pipe.ts
- apps/cloud-api/src/modules/audit/audit.service.ts
- apps/cloud-api/src/modules/audit/audit.module.ts

**TESTING REQUIREMENTS:**
- Rate limiting tests (exceed limits, reset windows)
- Security header tests
- Audit logging tests (all event types)
- XSS/injection prevention tests
- Load tests with rate limiting enabled
```

### 4.4 Verification Prompts

#### 4.4.1 Authentication & Authorization Verification

```markdown
## VERIFICATION PROMPT: Phase 2 Complete

**TASK:** Verify that Phase 2 authentication and authorization systems are secure and performant

**VERIFICATION CHECKLIST:**

### 1. Authentication Security Verification
- [ ] **Password Security:**
  - Weak passwords rejected (< 10 chars, common passwords)
  - Argon2id hashing with proper parameters
  - Timing attack protection (constant time for invalid users)
  - Password change invalidates other sessions

- [ ] **Account Lockout:**
  - 5 failed attempts lock account for 15 minutes
  - Lockout persists across different IPs
  - Progressive delays for repeated lockouts
  - Admin can unlock accounts manually

- [ ] **Multi-Factor Authentication:**
  - TOTP setup generates valid QR codes
  - TOTP validation accepts 30-second window
  - Recovery codes work once only
  - MFA required for admin roles

### 2. Authorization Matrix Verification
Test each role's permissions exactly as specified:

- [ ] **Platform Owner:**
  - Can access all schools' data
  - Can create new schools
  - Can manage global settings
  - Cannot be locked out by school admins

- [ ] **School Admin:**
  - Can manage all users in their school only
  - Cannot access other schools' data
  - Can view all exams and results in school
  - Can release results for any class

- [ ] **Teacher:**
  - Can only see assigned classes and subjects
  - Can create questions in assigned subjects only
  - Can view approved questions from other teachers
  - Cannot access unrelated students

- [ ] **Parent:**
  - Can only see linked children's data
  - Can only see released results
  - Cannot see other families' data
  - Cannot access admin functions

### 3. Security Middleware Verification
- [ ] **Rate Limiting:**
  - Authentication: 10 requests/min per IP maximum
  - API calls: 300 requests/min per user maximum
  - Rate limit headers included in responses
  - Rate limits reset correctly after window

- [ ] **Security Headers:**
  - HSTS header present with proper max-age
  - X-Frame-Options: DENY
  - X-Content-Type-Options: nosniff
  - CSP header blocks inline scripts
  - CORS properly configured for environment

- [ ] **Audit Logging:**
  - All authentication attempts logged
  - Authorization failures logged with details
  - Privileged operations logged
  - Logs include correlation IDs and user context

### 4. Performance Verification
- [ ] **Authentication Performance:**
  - Login response time <200ms (95th percentile)
  - Password hashing time 200-500ms
  - Session validation <50ms
  - Risk assessment <100ms

- [ ] **Authorization Performance:**
  - Permission checks <10ms
  - Ability building <50ms
  - Permission cache hit rate >90%
  - No N+1 queries in permission checks

### 5. Integration Verification
- [ ] **Session Management:**
  - Sessions persist across server restarts
  - Session cleanup removes expired sessions
  - Concurrent sessions handled correctly
  - Session hijacking prevented

- [ ] **Token Security:**
  - JWT tokens have short expiration (15 minutes)
  - Refresh tokens work correctly
  - Token revocation is immediate
  - No sensitive data in JWT payload

### 6. Security Testing
- [ ] **Penetration Testing:**
  - SQL injection attempts blocked
  - XSS attempts sanitized
  - CSRF protection working
  - Session fixation prevented
  - Timing attacks mitigated

- [ ] **Load Testing:**
  - 1000 concurrent authentication requests
  - Rate limiting holds under load
  - No memory leaks in session storage
  - Permission checks scale linearly

**PHASE 2 COMPLETION CRITERIA:**
✅ All security tests pass
✅ Performance benchmarks met
✅ Permission matrix matches specification exactly
✅ Rate limiting works under load
✅ Audit logging captures all required events
✅ Multi-factor authentication is robust

**ROLLBACK CONDITIONS:**
❌ Any security vulnerability discovered
❌ Performance requirements not met
❌ Permission bypass possible
❌ Rate limiting ineffective
❌ Authentication can be brute-forced
```
---

## 5. Phase 3: Data Layer & ORM

### 5.1 Phase Overview
**Duration:** 5-7 days  
**Goal:** Implement database connections, ORM setup, and data access patterns  
**Prerequisites:** Phase 2 complete  
**Team Size:** 2-3 developers (1 database-focused)  

### 5.2 Implementation Guide

#### 5.2.1 Database Setup Prompt

```markdown
## PROMPT: Phase 3.1 - Database Layer Implementation

**TASK:** Implement Drizzle ORM setup with PostgreSQL and SQLite connections

**REQUIREMENTS:**

1. **PostgreSQL Schema (Cloud):**
   ```typescript
   // apps/cloud-api/src/database/schema/
   // Implement complete schema from CBT-Database-Architecture.md
   // Include all tables, indexes, constraints, and RLS policies
   
   export const schools = pgTable('schools', {
     id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
     code: text('code').notNull().unique(),
     name: text('name').notNull(),
     // ... all fields from specification
   });
   
   // All 30+ tables with proper relationships and indexes
   ```

2. **SQLite Schema (School Server):**
   ```typescript
   // apps/school-server/src/database/schema/
   // Implement school server schema from CBT-Database-Architecture.md
   // Optimized for single-writer, many-reader access pattern
   
   export const students = sqliteTable('students', {
     id: text('id').primaryKey(),
     code: text('code').notNull().unique(),
     // ... minimal fields as specified
   });
   ```

3. **Migration System:**
   ```typescript
   // Database migrations with proper rollback support
   // Automated migration running
   // Schema validation and integrity checks
   ```

4. **Connection Management:**
   ```typescript
   // apps/cloud-api/src/database/database.service.ts
   export class DatabaseService {
     async getConnection(): Promise<PostgresJsDatabase>;
     async transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>;
     async healthCheck(): Promise<HealthStatus>;
   }
   ```

**FILES TO CREATE:**
- apps/cloud-api/src/database/schema/ (complete schema)
- apps/school-server/src/database/schema/ (school schema)
- apps/cloud-api/src/database/migrations/
- apps/cloud-api/src/database/database.service.ts
- apps/school-server/src/database/database.service.ts

**TESTING REQUIREMENTS:**
- Migration tests (up and down)
- Connection pool tests
- Transaction rollback tests
- Schema validation tests
```

---

## 6. Phase 4: User Management

### 6.1 Phase Overview
**Duration:** 8-10 days  
**Goal:** Implement complete user management system with invitations and onboarding  
**Prerequisites:** Phase 3 complete  
**Team Size:** 2-3 developers  

### 6.2 Implementation Guide

#### 6.2.1 User Management System Prompt

```markdown
## PROMPT: Phase 4.1 - Complete User Management System

**TASK:** Implement user lifecycle management with invitation system and role-based onboarding

**REQUIREMENTS:**

1. **User Service:**
   ```typescript
   // apps/cloud-api/src/modules/users/users.service.ts
   export class UsersService {
     // Teacher Management
     async createTeacher(data: CreateTeacherDto): Promise<User>;
     async inviteTeacher(teacherId: string, channel: NotificationChannel): Promise<Invitation>;
     async suspendTeacher(teacherId: string, reason: string): Promise<void>;
     async deactivateTeacher(teacherId: string): Promise<void>;
     
     // Guardian Management  
     async createGuardian(data: CreateGuardianDto): Promise<Guardian>;
     async linkGuardianToStudent(guardianId: string, studentId: string, relationship: string): Promise<void>;
     async inviteGuardian(guardianId: string, channel: NotificationChannel): Promise<Invitation>;
     
     // Admin Management
     async createSchoolAdmin(schoolId: string, data: CreateAdminDto): Promise<User>;
     async inviteAdmin(adminId: string): Promise<Invitation>;
   }
   ```

2. **Invitation System:**
   ```typescript
   // apps/cloud-api/src/modules/invitations/invitations.service.ts
   export class InvitationsService {
     async createInvitation(type: InvitationType, data: InvitationData): Promise<Invitation>;
     async sendInvitation(invitationId: string, channel: NotificationChannel): Promise<void>;
     async resendInvitation(invitationId: string): Promise<void>;
     async revokeInvitation(invitationId: string): Promise<void>;
     async claimInvitation(token: string, claimData: ClaimData): Promise<User>;
     async validateInvitationToken(token: string): Promise<InvitationValidation>;
   }
   ```

3. **OTP System:**
   ```typescript
   // apps/cloud-api/src/modules/otp/otp.service.ts
   export class OTPService {
     async generateOTP(purpose: OTPPurpose, contact: string): Promise<OTPChallenge>;
     async verifyOTP(challengeId: string, code: string): Promise<boolean>;
     async resendOTP(challengeId: string): Promise<void>;
     async cleanupExpiredOTPs(): Promise<number>;
   }
   ```

4. **Notification Integration:**
   ```typescript
   // apps/cloud-api/src/modules/notifications/notifications.service.ts
   export class NotificationsService {
     async sendEmail(template: string, to: string, variables: any): Promise<void>;
     async sendSMS(template: string, to: string, variables: any): Promise<void>;
     async sendWhatsApp(template: string, to: string, variables: any): Promise<void>;
     async checkSMSCap(schoolId: string): Promise<boolean>;
   }
   ```

**INVITATION FLOW:**
1. Admin creates user account (status: 'invited')
2. System generates secure invitation token
3. Invitation sent via chosen channel (email/SMS/WhatsApp/print)
4. User clicks link and verifies identity with OTP
5. User sets password and accepts terms
6. Account activated (status: 'active')

**FILES TO CREATE:**
- apps/cloud-api/src/modules/users/ (complete module)
- apps/cloud-api/src/modules/invitations/ (complete module)
- apps/cloud-api/src/modules/otp/ (complete module)
- apps/cloud-api/src/modules/notifications/ (complete module)

**TESTING REQUIREMENTS:**
- Complete invitation flow tests
- OTP security tests (rate limiting, expiration)
- Guardian matching tests (duplicate detection)
- Notification delivery tests
```

### 6.3 Verification Prompts

#### 6.3.1 User Management Verification

```markdown
## VERIFICATION PROMPT: Phase 3 & 4 Complete

**TASK:** Verify that data layer and user management systems work correctly and securely

**VERIFICATION CHECKLIST:**

### 1. Database Layer Verification
- [ ] **PostgreSQL Connection:**
  - Connection pool works under load (100 concurrent connections)
  - Transactions commit and rollback correctly
  - RLS policies prevent cross-school data access
  - All indexes exist and are used by query planner

- [ ] **SQLite Connection:**
  - WAL mode enabled and working
  - Synchronous=FULL for durability
  - Foreign key constraints enforced
  - Backup via VACUUM INTO works

- [ ] **Migration System:**
  - Migrations run successfully on clean database
  - Rollback migrations work correctly
  - Schema matches specification exactly
  - Migration locks prevent concurrent runs

### 2. User Management Verification
- [ ] **Teacher Management:**
  - Create teacher account (status: 'invited')
  - Send invitation via email
  - Teacher claims invitation with password setup
  - Teacher can log in successfully
  - Suspend teacher (sessions revoked immediately)

- [ ] **Guardian Management:**
  - Create guardian with phone number
  - Link guardian to multiple students
  - Duplicate detection works (same phone = warning)
  - Send invitation via SMS/WhatsApp
  - Guardian claims with OTP verification

- [ ] **Admin Management:**
  - Platform owner creates first school admin
  - School admin creates additional admins
  - Admin accounts require 2FA setup
  - Admin permissions work correctly

### 3. Invitation System Verification
- [ ] **Invitation Security:**
  - Tokens are cryptographically secure (256-bit)
  - Tokens expire correctly (7 days staff, 14 days guardians)
  - Used tokens cannot be reused
  - Revoked tokens are immediately invalid

- [ ] **OTP System:**
  - OTP codes are 6 digits, expire in 10 minutes
  - 5 wrong attempts lock the code
  - 1 minute cooldown between resend requests
  - Codes sent to registered contact only

- [ ] **Notification Delivery:**
  - Email invitations include proper links
  - SMS messages stay within character limits
  - WhatsApp messages format correctly
  - SMS cap enforcement works

### 4. Data Security Verification
- [ ] **Row-Level Security:**
  - Users cannot access other schools' data
  - Teachers only see assigned classes
  - Parents only see linked children
  - Admins see full school data only

- [ ] **Data Validation:**
  - All user inputs validated with Zod schemas
  - SQL injection attempts blocked
  - Phone numbers normalized to E.164 format
  - Email addresses validated and normalized

### 5. Performance Verification
- [ ] **Database Performance:**
  - User lookup by email: <50ms
  - Guardian search by phone: <100ms
  - Student list for class: <200ms
  - Permission check: <10ms

- [ ] **Invitation Performance:**
  - Invitation creation: <100ms
  - OTP generation: <50ms
  - Email sending: <2s (queued job)
  - SMS sending: <5s (external API)

**PHASE 3 & 4 COMPLETION CRITERIA:**
✅ Database connections are stable and performant
✅ All migration scenarios work correctly
✅ User management covers all roles and flows
✅ Invitation system is secure and reliable
✅ Notification delivery works across channels
✅ Data security prevents unauthorized access

**ROLLBACK CONDITIONS:**
❌ Database corruption or data loss possible
❌ Security bypass in user management
❌ Invitation tokens can be predicted/brute-forced
❌ Performance requirements not met
❌ Cross-school data leakage possible
```
---

## 7. Phase 5: Question Bank System

### 7.1 Implementation Guide

#### 7.1.1 Question Bank System Prompt

```markdown
## PROMPT: Phase 5.1 - Advanced Question Bank with Search & Import

**TASK:** Implement complete question management system with full-text search and import capabilities

**REQUIREMENTS:**

1. **Question Management Service:**
   ```typescript
   export class QuestionsService {
     async createQuestion(data: CreateQuestionDto): Promise<Question>;
     async updateQuestion(id: string, data: UpdateQuestionDto): Promise<Question>;
     async approveQuestion(id: string, approverId: string): Promise<Question>;
     async retireQuestion(id: string): Promise<void>;
     async searchQuestions(criteria: SearchCriteria): Promise<PaginatedResult<Question>>;
     async getQuestionsByTopic(subjectId: string, topic: string): Promise<Question[]>;
     async duplicateQuestion(id: string): Promise<Question>;
   }
   ```

2. **Full-Text Search Implementation:**
   ```typescript
   // PostgreSQL tsvector with GIN indexes
   // Trigram similarity for fuzzy matching
   // Advanced ranking with boosted fields
   // Autocomplete with trie data structure
   ```

3. **Import System:**
   ```typescript
   export class ImportService {
     async uploadFile(file: Express.Multer.File, type: ImportType): Promise<ImportJob>;
     async parseFile(jobId: string): Promise<ImportPreview>;
     async validateRows(jobId: string): Promise<ValidationResult>;
     async confirmImport(jobId: string): Promise<ImportResult>;
     async getImportHistory(schoolId: string): Promise<ImportJob[]>;
   }
   ```

**FILES TO CREATE:**
- apps/cloud-api/src/modules/questions/ (complete module)
- apps/cloud-api/src/modules/import/ (complete module)
- apps/cloud-api/src/modules/assets/ (file upload handling)

**TESTING REQUIREMENTS:**
- Question versioning tests (immutable approved questions)
- Search relevance tests
- Import validation tests (Word/Excel formats)
- Performance tests (10,000+ questions)
```

---

## 8. Phase 6: Exam Engine

### 8.1 Implementation Guide

#### 8.1.1 Exam Engine Prompt

```markdown
## PROMPT: Phase 6.1 - Comprehensive Exam Management System

**TASK:** Implement exam creation, pack generation, and scheduling system

**REQUIREMENTS:**

1. **Exam Management Service:**
   ```typescript
   export class ExamsService {
     async createExam(data: CreateExamDto): Promise<Exam>;
     async addQuestionsToExam(examId: string, questionIds: string[]): Promise<void>;
     async publishExam(examId: string): Promise<ExamPack>;
     async scheduleExam(examId: string, schedule: ExamSchedule): Promise<Sitting[]>;
     async freezeExam(examId: string): Promise<void>;
   }
   ```

2. **Pack Generation Service:**
   ```typescript
   export class PackService {
     async buildExamPack(examId: string): Promise<ExamPack>;
     async signPack(pack: ExamPack): Promise<string>;
     async validatePackIntegrity(pack: ExamPack): Promise<ValidationResult>;
     async encryptAnswerKeys(keys: AnswerKeys, deviceSecret: string): Promise<EncryptedKeys>;
   }
   ```

3. **Scheduling System:**
   ```typescript
   export class SchedulingService {
     async createSitting(examId: string, classId: string, timeWindow: TimeWindow): Promise<Sitting>;
     async assignSeats(sittingId: string, assignments: SeatAssignment[]): Promise<void>;
     async openSitting(sittingId: string, examKey: string): Promise<void>;
     async closeSitting(sittingId: string): Promise<void>;
   }
   ```

**FILES TO CREATE:**
- apps/cloud-api/src/modules/exams/ (complete module)
- apps/cloud-api/src/modules/packs/ (pack generation)
- apps/cloud-api/src/modules/scheduling/ (exam scheduling)

**TESTING REQUIREMENTS:**
- Pack generation and validation tests
- Exam freeze behavior tests
- Scheduling conflict detection tests
- Cryptographic signing tests
```

---

## 9. Phase 7: School Server

### 9.1 Implementation Guide

#### 9.1.1 School Server Core Prompt

```markdown
## PROMPT: Phase 7.1 - School Server Implementation

**TASK:** Implement complete school server with exam delivery and session management

**REQUIREMENTS:**

1. **Exam Server Core:**
   ```typescript
   // apps/school-server/src/modules/exam/exam.service.ts
   export class ExamService {
     async studentLogin(code: string, examKey: string, seat?: string): Promise<SessionToken>;
     async startExamSession(sessionId: string): Promise<ExamData>;
     async saveAnswer(sessionId: string, answer: AnswerUpdate): Promise<AnswerResult>;
     async submitExam(sessionId: string, reason: SubmitReason): Promise<SubmissionResult>;
     async getSessionProgress(sessionId: string): Promise<SessionProgress>;
   }
   ```

2. **Session Management:**
   ```typescript
   export class SessionManager {
     async createSession(student: Student, sitting: Sitting): Promise<ExamSession>;
     async validateSession(token: string): Promise<ExamSession | null>;
     async updateLastActivity(sessionId: string): Promise<void>;
     async expireSession(sessionId: string): Promise<void>;
     async resetSession(sessionId: string, keepAnswers: boolean): Promise<void>;
   }
   ```

3. **Answer Processing:**
   ```typescript
   export class AnswerProcessor {
     async processAnswerBatch(updates: AnswerUpdate[]): Promise<void>;
     async markAnswers(sessionId: string): Promise<SessionScore>;
     async validateAnswerSequence(update: AnswerUpdate, lastSeq: number): Promise<boolean>;
   }
   ```

4. **Invigilator Console:**
   ```typescript
   export class ConsoleService {
     async authenticateInvigilator(pin: string): Promise<ConsoleToken>;
     async getSittingOverview(sittingId: string): Promise<SittingOverview>;
     async grantExtraTime(sessionId: string, minutes: number, reason: string): Promise<void>;
     async resetStudentSession(sessionId: string, reason: string): Promise<void>;
     async getLiveProgress(): Promise<LiveProgress[]>;
   }
   ```

**FILES TO CREATE:**
- apps/school-server/src/modules/exam/ (exam delivery)
- apps/school-server/src/modules/console/ (invigilator interface)
- apps/school-server/src/modules/sessions/ (session management)
- apps/school-server/src/modules/answers/ (answer processing)

**TESTING REQUIREMENTS:**
- Session lifecycle tests
- Answer batching and validation tests
- Invigilator console functionality tests
- Offline operation tests
```

---

## 10. Phase 8: Sync System

### 10.1 Implementation Guide

#### 10.1.1 Sync System Prompt

```markdown
## PROMPT: Phase 8.1 - Bidirectional Sync Implementation

**TASK:** Implement robust sync system between school servers and cloud

**REQUIREMENTS:**

1. **Cloud Sync Service:**
   ```typescript
   export class SyncService {
     async handleSyncRequest(deviceId: string, request: SyncRequest): Promise<SyncResponse>;
     async getChangesSince(schoolId: string, cursor: number): Promise<ChangeSet>;
     async processUploadBatch(events: SyncEvent[]): Promise<ProcessResult>;
     async validateSyncSignature(request: SyncRequest): Promise<boolean>;
   }
   ```

2. **School Sync Agent:**
   ```typescript
   export class SyncAgent {
     async pullChanges(): Promise<ChangeSet>;
     async pushEvents(): Promise<PushResult>;
     async processChangeSet(changes: ChangeSet): Promise<void>;
     async queueEvent(event: SyncEvent): Promise<void>;
     async retryFailedEvents(): Promise<void>;
   }
   ```

3. **Event Processing:**
   ```typescript
   export class EventProcessor {
     async processSessionCompleted(event: SessionCompletedEvent): Promise<void>;
     async processSessionScored(event: SessionScoredEvent): Promise<void>;
     async processSittingClosed(event: SittingClosedEvent): Promise<void>;
   }
   ```

**FILES TO CREATE:**
- apps/cloud-api/src/modules/sync/ (cloud sync service)
- apps/school-server/src/modules/sync/ (sync agent)
- packages/exam-core/src/sync/ (shared sync logic)

**TESTING REQUIREMENTS:**
- Sync signature validation tests
- Event ordering and idempotency tests
- Network failure recovery tests
- Large batch processing tests
```

---

## 11. Phase 9: Results & Analytics

### 11.1 Implementation Guide

#### 11.1.1 Results System Prompt

```markdown
## PROMPT: Phase 9.1 - Results Management & Analytics

**TASK:** Implement complete results processing, review, and release system

**REQUIREMENTS:**

1. **Results Service:**
   ```typescript
   export class ResultsService {
     async processSubmission(submission: Submission): Promise<Result>;
     async reviewResults(examId: string, teacherId: string): Promise<ReviewSummary>;
     async releaseResults(examId: string, classId?: string): Promise<ReleaseResult>;
     async reMarkAfterKeyChange(examId: string, reason: string): Promise<RemarkResult>;
     async generateResultReport(examId: string): Promise<Report>;
   }
   ```

2. **Analytics Engine:**
   ```typescript
   export class AnalyticsService {
     async calculateClassStatistics(classId: string, examId: string): Promise<ClassStats>;
     async getPerformanceTrends(studentId: string): Promise<TrendData>;
     async generateDashboardData(userId: string): Promise<DashboardData>;
     async detectAnomalies(examId: string): Promise<Anomaly[]>;
   }
   ```

3. **Parent Portal Service:**
   ```typescript
   export class ParentPortalService {
     async getChildrenResults(guardianId: string): Promise<ChildResult[]>;
     async getResultDetails(resultId: string): Promise<ResultDetail>;
     async getPerformanceHistory(studentId: string): Promise<PerformanceHistory>;
   }
   ```

**FILES TO CREATE:**
- apps/cloud-api/src/modules/results/ (results management)
- apps/cloud-api/src/modules/analytics/ (analytics engine)
- apps/cloud-api/src/modules/parent-portal/ (parent services)

**TESTING REQUIREMENTS:**
- Results calculation accuracy tests
- Release permission tests
- Analytics performance tests
- Parent portal security tests
```

---

## 12. Phase 10: Monitoring & Production

### 12.1 Implementation Guide

#### 12.1.1 Production Readiness Prompt

```markdown
## PROMPT: Phase 10.1 - Production Monitoring & Deployment

**TASK:** Implement comprehensive monitoring, logging, and production deployment systems

**REQUIREMENTS:**

1. **Monitoring Service:**
   ```typescript
   export class MonitoringService {
     async recordMetric(metric: Metric): Promise<void>;
     async checkSystemHealth(): Promise<HealthReport>;
     async detectPerformanceAnomalies(): Promise<Anomaly[]>;
     async generateAlerts(conditions: AlertCondition[]): Promise<void>;
   }
   ```

2. **Deployment System:**
   ```typescript
   // Blue-green deployment configuration
   // Auto-scaling based on metrics
   // Database migration automation
   // Health check integration
   ```

3. **Backup & Recovery:**
   ```typescript
   export class BackupService {
     async createDatabaseBackup(): Promise<BackupResult>;
     async validateBackupIntegrity(backupId: string): Promise<boolean>;
     async restoreFromBackup(backupId: string): Promise<RestoreResult>;
     async scheduleBackups(schedule: BackupSchedule): Promise<void>;
   }
   ```

**FILES TO CREATE:**
- Monitoring and alerting configuration
- Deployment scripts and CI/CD pipelines
- Backup and recovery procedures
- Production environment setup

**TESTING REQUIREMENTS:**
- Load testing under production conditions
- Disaster recovery testing
- Performance regression testing
- Security penetration testing
```

---

## 13. Final Verification & Acceptance

### 13.1 Complete System Verification

```markdown
## VERIFICATION PROMPT: All Phases Complete - System Acceptance

**TASK:** Perform comprehensive end-to-end verification of the complete CBT Platform backend

**VERIFICATION CHECKLIST:**

### 1. End-to-End Workflow Verification
- [ ] **Complete Teacher Workflow:**
  - Create and invite teacher account
  - Teacher activates account with 2FA
  - Import questions from Word/Excel file
  - Create exam with imported questions
  - Schedule exam for class
  - Generate and sign exam pack

- [ ] **Complete Student Workflow:**
  - Generate student codes
  - Student logs in with code and exam key
  - Answer questions with auto-save
  - Submit exam (manual or automatic)
  - Results calculated and stored

- [ ] **Complete Parent Workflow:**
  - Create and invite guardian account
  - Guardian activates with OTP verification
  - View child's released results
  - Receive notifications of new results

### 2. System Integration Verification
- [ ] **Cloud ↔ School Server Sync:**
  - Exam packs sync down correctly
  - Student results sync up correctly
  - Network interruption recovery works
  - Large batch processing performs well

- [ ] **Data Consistency:**
  - Same answer produces same score on both systems
  - Student codes work identically everywhere
  - Exam shuffling is deterministic and consistent

### 3. Performance & Scale Verification
- [ ] **Load Testing Results:**
  - 1000 concurrent student logins: <500ms response
  - 2000 answers/second processing: <50ms per answer
  - 100 concurrent teacher searches: <200ms response
  - 50 concurrent exam pack generations: <10s each

- [ ] **Resource Usage:**
  - Cloud API memory usage: <1GB per instance
  - School server memory usage: <500MB
  - Database growth rate: predictable and reasonable
  - No memory leaks under extended load

### 4. Security & Compliance Verification
- [ ] **Security Audit Results:**
  - No critical vulnerabilities found
  - All authentication flows secure
  - Data access properly scoped by role
  - Audit logs capture all required events

- [ ] **Data Protection:**
  - Student data minimized on school servers
  - Parent data never leaves cloud
  - All sensitive data encrypted at rest
  - Secure communication protocols used

### 5. Operational Readiness
- [ ] **Monitoring & Alerting:**
  - All critical metrics monitored
  - Alert thresholds properly configured
  - Incident response procedures documented
  - Performance dashboards functional

- [ ] **Backup & Recovery:**
  - Automated backup procedures working
  - Recovery procedures tested and documented
  - RTO/RPO targets met in testing
  - Disaster recovery plan validated

**SYSTEM ACCEPTANCE CRITERIA:**
✅ All functional requirements implemented and tested
✅ All performance benchmarks met or exceeded
✅ Security audit passed with no critical issues
✅ Operational procedures documented and tested
✅ Team trained and ready for production support
✅ Monitoring and alerting fully operational

**GO-LIVE CHECKLIST:**
- [ ] Production infrastructure provisioned
- [ ] DNS and SSL certificates configured
- [ ] Monitoring and alerting deployed
- [ ] Backup procedures automated
- [ ] Support team trained
- [ ] Incident response procedures tested
- [ ] Performance baselines established
- [ ] Security controls verified

**SUCCESS METRICS:**
- System uptime >99.9%
- Response times meet all SLA targets
- Zero data loss incidents
- Security audit findings remediated
- User satisfaction >90% in first month
- Support ticket volume <5/day average
```

---

## 14. Implementation Timeline Summary

| Phase | Duration | Parallel Work | Cumulative |
|-------|----------|---------------|------------|
| Phase 0: Foundation | 3-5 days | No | 5 days |
| Phase 1: Infrastructure | 5-7 days | No | 12 days |
| Phase 2: Auth & Authorization | 7-10 days | No | 22 days |
| Phase 3: Data Layer | 5-7 days | No | 29 days |
| Phase 4: User Management | 8-10 days | No | 39 days |
| Phase 5: Question Bank | 10-12 days | Partial with Phase 6 | 47 days |
| Phase 6: Exam Engine | 12-15 days | Partial with Phase 5,7 | 54 days |
| Phase 7: School Server | 10-14 days | Partial with Phase 6,8 | 61 days |
| Phase 8: Sync System | 8-12 days | Partial with Phase 7,9 | 67 days |
| Phase 9: Results & Analytics | 10-14 days | Partial with Phase 8,10 | 74 days |
| Phase 10: Production | 7-10 days | Final integration | 84 days |

**Total Estimated Timeline: 12-14 weeks (3-3.5 months)**

With 3-4 developers working efficiently, following this phase-by-phase approach ensures quality, maintainability, and reduces integration risks.