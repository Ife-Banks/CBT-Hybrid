# CBT Platform — Phase 0: Foundation & Setup

**Version:** 1.0  
**Date:** October 14, 2026  
**Phase Duration:** 3-5 days  
**Team Size:** 1-2 developers  
**Risk Level:** Low  
**Dependencies:** None  

---

## Table of Contents

1. [Phase Overview](#1-phase-overview)
2. [Phase Story](#2-phase-story)
3. [Implementation Prompt](#3-implementation-prompt)
4. [Independent Verification Prompt](#4-independent-verification-prompt)

---

## 1. Phase Overview

### 1.1 Phase Goals

Phase 0 establishes the **foundational infrastructure** for the entire CBT Platform development process. This phase focuses on creating a robust, scalable development environment that will support all subsequent phases.

### 1.2 Key Deliverables

| Deliverable | Description | Success Criteria |
|-------------|-------------|------------------|
| **Monorepo Structure** | Complete workspace with apps and packages | All packages install and link correctly |
| **Development Environment** | Docker compose with all services | All services start and are accessible |
| **CI/CD Pipeline** | GitHub Actions for testing and deployment | Pipeline passes on sample code |
| **Development Tooling** | ESLint, Prettier, TypeScript configuration | Code quality tools work consistently |
| **Documentation Framework** | README, contribution guidelines, setup docs | New team members can onboard in <30 minutes |

### 1.3 Success Criteria

✅ **Complete development setup in under 30 minutes on a fresh machine**  
✅ **All team members can contribute code with consistent formatting and linting**  
✅ **CI/CD pipeline provides fast feedback on code quality**  
✅ **Development environment is reproducible and reliable**  
✅ **Foundation supports all planned architectural components**  

---

## 2. Phase Story

### 2.1 The Foundation Challenge

Before building the CBT Platform's complex exam delivery system, we need a **rock-solid foundation**. Imagine trying to construct a skyscraper without proper ground preparation—the entire structure would be unstable from the start.

### 2.2 What We're Building

In Phase 0, we're creating the **development ecosystem** that will power the entire project:

**The Monorepo Workspace**  
Like a well-organized city with different districts, our monorepo will house multiple applications (cloud API, school server, exam client) and shared packages (algorithms, types, utilities) all working together seamlessly.

**The Development Environment**  
Every developer needs the same reliable infrastructure. Our Docker-based environment ensures that whether you're on Windows, Mac, or Linux, you get identical PostgreSQL, Redis, and S3 services with zero configuration conflicts.

**The Quality Assurance Pipeline**  
From day one, we establish automated quality gates. Every code commit triggers linting, type checking, testing, and security scans. This prevents technical debt from accumulating and maintains high code quality throughout development.

**The Team Collaboration Framework**  
Clear documentation, consistent tooling, and standardized procedures ensure that new developers can become productive quickly and existing team members work efficiently together.

### 2.3 Why This Phase Matters

**Speed of Development**: A well-configured foundation allows developers to focus on business logic instead of fighting with tooling and environment issues.

**Code Quality**: Automated linting, formatting, and testing from the start prevents bugs and maintains consistency as the team grows.

**Reproducibility**: Containerized development environments eliminate "works on my machine" problems and make deployment predictable.

**Scalability**: The monorepo structure supports our complex multi-application architecture while keeping shared code DRY and maintainable.

### 2.4 Phase Success Story

When Phase 0 is complete, this is what success looks like:

**For a New Developer:**
1. Clone the repository
2. Run `pnpm dev:setup`
3. Wait 3-5 minutes for Docker services to start
4. Run `pnpm dev` and immediately start coding
5. Make a change, save the file, and see instant hot reload
6. Create a PR and watch comprehensive CI checks pass

**For the Team:**
- Consistent code formatting across all contributors
- Fast, reliable test suite that catches bugs early  
- Automated security scanning prevents vulnerabilities
- Clear documentation makes onboarding smooth
- Standardized procedures reduce confusion and errors

---

## 3. Implementation Prompt

```markdown
## IMPLEMENTATION PROMPT: Phase 0 - Foundation & Setup

**CONTEXT:** You are implementing the foundational development environment for the CBT Platform, a comprehensive computer-based testing system. This foundation will support a complex monorepo with multiple NestJS applications, React clients, and shared TypeScript packages.

**OBJECTIVE:** Create a complete, production-ready development environment that enables fast, reliable development with automated quality assurance.

---

### TASK 1: Monorepo Structure Setup

**Create the complete monorepo structure:**

```
CBT-School/
├── apps/
│   ├── cloud-api/              # NestJS cloud backend
│   ├── cloud-web/              # Next.js admin portals (placeholder)
│   ├── school-server/          # NestJS school server
│   ├── exam-client/            # React exam delivery app (placeholder)
│   └── installer/              # Windows installer (placeholder)
├── packages/
│   ├── exam-core/              # Core algorithms (student codes, shuffling, marking)
│   ├── shared-types/           # Zod schemas and TypeScript types
│   ├── ui/                     # Design system components (placeholder)
│   ├── config/                 # Shared ESLint, TypeScript configs
│   └── test-fixtures/          # Test utilities and mock data
├── docs/                       # Architecture and phase documentation
├── docker/                     # Docker compose and service configs
├── scripts/                    # Development and deployment scripts
└── .github/workflows/          # CI/CD GitHub Actions
```

**Requirements:**
1. **Package Manager**: Use pnpm with workspace configuration
2. **TypeScript**: Setup project references for fast compilation
3. **Shared Configuration**: ESLint, Prettier, and TypeScript configs in packages/config
4. **Build System**: Turbo for optimized builds and caching
5. **Scripts**: Unified scripts for dev, build, test, lint across all packages

**Files to Create:**
- `package.json` (root with workspace config)
- `pnpm-workspace.yaml`
- `turbo.json` (build orchestration)
- `tsconfig.json` (root + each app/package)
- `packages/config/eslint.config.js`
- `packages/config/tsconfig.base.json`
- `.prettierrc`
- Each app and package's `package.json`

---

### TASK 2: Development Environment Setup

**Create containerized development environment:**

**Docker Services Required:**
1. **PostgreSQL 15** with extensions:
   - uuid-ossp (UUID generation)
   - citext (case-insensitive text)
   - pg_trgm (full-text search)
   - btree_gin (advanced indexing)

2. **Redis 7** for caching and job queues

3. **MinIO** for S3-compatible object storage

4. **Mailpit** for email testing in development

5. **Adminer** for database management UI

**Configuration Requirements:**
- All services accessible on standard ports
- Persistent volumes for data
- Health checks for service monitoring
- Environment variable configuration
- Development-optimized settings (fast startup, debug logging)

**Scripts to Create:**
- `scripts/dev-setup.sh` - Initialize complete environment
- `scripts/dev-start.sh` - Start all services with health checks
- `scripts/dev-clean.sh` - Clean volumes and reset to fresh state
- `scripts/dev-logs.sh` - Show logs from all services

**Files to Create:**
- `docker-compose.dev.yml`
- `docker/postgres/init.sql`
- `docker/postgres/extensions.sql`
- `.env.example` (all required environment variables)
- All development scripts in `scripts/` directory

---

### TASK 3: CI/CD Pipeline Setup

**Create comprehensive GitHub Actions workflows:**

**Main CI Pipeline (.github/workflows/ci.yml):**
- **Triggers**: Push and pull requests to main/develop branches
- **Jobs**: lint, typecheck, test, build, security-scan
- **Matrix Strategy**: Test on Node.js 18 and 20
- **Caching**: pnpm dependencies and build artifacts
- **Quality Gates**: All jobs must pass before merge

**Security Pipeline (.github/workflows/security.yml):**
- **CodeQL Analysis**: Static code analysis for vulnerabilities
- **Dependency Audit**: Check for known security issues in dependencies
- **License Compliance**: Ensure all dependencies have compatible licenses
- **SAST Scanning**: Additional static application security testing

**Release Pipeline (.github/workflows/release.yml):**
- **Trigger**: Version tags (v*.*.*)
- **Build**: Production Docker images
- **Publish**: Push to container registry
- **Release**: Create GitHub release with auto-generated changelog

**Database Pipeline (.github/workflows/migration-test.yml):**
- **Migration Testing**: Run all migrations on clean database
- **Rollback Testing**: Verify migration rollback procedures
- **Schema Validation**: Ensure schema matches expected structure

**Performance Requirements:**
- CI pipeline completes in <10 minutes
- Security scanning completes in <15 minutes
- Effective caching reduces repeat runs to <5 minutes
- Parallel job execution where possible

**Files to Create:**
- `.github/workflows/ci.yml`
- `.github/workflows/security.yml`
- `.github/workflows/release.yml`
- `.github/workflows/migration-test.yml`
- `.github/dependabot.yml` (automated dependency updates)

---

### TASK 4: Development Tooling Configuration

**IDE Configuration:**
Create VS Code configuration for optimal development experience:

**Extensions Recommended:**
- ESLint, Prettier (code quality)
- TypeScript Importer (auto imports)
- Docker (container management)
- GitLens (git integration)
- Thunder Client (API testing)

**Settings Configuration:**
- Format on save enabled
- Auto import optimization
- TypeScript strict mode
- Debugging configurations for each app

**Task Configuration:**
- Build all packages
- Run tests with watch mode  
- Start development servers
- Run linting and type checking

**Files to Create:**
- `.vscode/settings.json`
- `.vscode/extensions.json`
- `.vscode/tasks.json`
- `.vscode/launch.json` (debugging configs)

---

### TASK 5: Documentation Framework

**Create comprehensive project documentation:**

**Root README.md:**
- Project overview and architecture
- Quick start guide (should enable productivity in <30 minutes)
- Development workflow instructions
- Troubleshooting common issues
- Links to detailed documentation

**CONTRIBUTING.md:**
- Code style guidelines
- Pull request process
- Testing requirements
- Security considerations
- How to run different types of tests

**Development Documentation:**
- Environment setup instructions
- Database management procedures
- Debugging guide for each service
- Performance optimization tips

**Files to Create:**
- `README.md`
- `CONTRIBUTING.md`
- `docs/development/SETUP.md`
- `docs/development/DEBUGGING.md`
- `docs/development/TROUBLESHOOTING.md`

---

### IMPLEMENTATION CHECKLIST

When implementing, ensure you complete each task fully:

- [ ] **Task 1**: Monorepo structure created and `pnpm install` works
- [ ] **Task 2**: All Docker services start and are accessible
- [ ] **Task 3**: CI/CD pipelines pass on sample code
- [ ] **Task 4**: VS Code configuration works for development
- [ ] **Task 5**: Documentation enables quick onboarding

### ACCEPTANCE CRITERIA

Before considering Phase 0 complete:

✅ **Quick Setup**: New developer can be productive in <30 minutes  
✅ **Reliable Environment**: All services start consistently  
✅ **Quality Automation**: CI/CD catches issues automatically  
✅ **Consistent Tooling**: All developers use same linting/formatting  
✅ **Clear Documentation**: Setup and contribution procedures are clear  

### PERFORMANCE TARGETS

- `pnpm install` completes in <2 minutes
- `pnpm dev:start` starts all services in <30 seconds  
- Hot reload works in <2 seconds for code changes
- Full build completes in <3 minutes
- CI pipeline runs in <10 minutes

### SECURITY REQUIREMENTS

- No secrets in repository (use .env files)
- Dependencies scanned for vulnerabilities
- Secure default configurations for all services
- HTTPS/TLS enabled where appropriate
- Access controls for sensitive operations

---

**NEXT STEPS:** After completing implementation, proceed to the Independent Verification Prompt to validate the foundation is solid before moving to Phase 1.
```

---

## 4. Independent Verification Prompt

```markdown
## VERIFICATION PROMPT: Phase 0 Foundation Complete

**OBJECTIVE:** Verify that the Phase 0 foundation is properly implemented and ready to support subsequent development phases.

**VERIFICATION APPROACH:** This verification should be performed by someone other than the implementer, ideally a senior developer or team lead, to ensure objective assessment.

---

### VERIFICATION ENVIRONMENT

**Setup Fresh Verification:**
1. Use a clean machine or fresh container
2. Clone the repository to a new directory
3. Do not use any pre-existing development setup
4. Follow only the documentation provided in the repository

---

### SECTION 1: Repository Structure Verification

**Test the monorepo structure and package management:**

- [ ] **Repository Clone**: `git clone <repo-url> cbt-verification`
- [ ] **Dependency Installation**: `pnpm install` completes without errors in <2 minutes
- [ ] **Workspace Verification**: `pnpm list --depth=0` shows all workspace packages
- [ ] **TypeScript Compilation**: `pnpm build` succeeds for all packages
- [ ] **Linting Verification**: `pnpm lint` passes with no errors or warnings
- [ ] **Type Checking**: `pnpm typecheck` passes for all packages
- [ ] **Cross-Package Dependencies**: Packages can import from each other correctly

**Expected Results:**
- All commands complete successfully
- No missing dependencies or broken links
- TypeScript project references work correctly
- Shared configuration is applied consistently

---

### SECTION 2: Development Environment Verification

**Test the containerized development environment:**

- [ ] **Environment Setup**: `pnpm dev:setup` initializes all services
- [ ] **Service Health Checks**: All Docker containers start and report healthy
- [ ] **Database Connection**: 
  ```bash
  psql postgresql://cbt_app:password@localhost:5432/cbt_cloud -c "SELECT version();"
  ```
- [ ] **Redis Connection**: 
  ```bash
  redis-cli -h localhost -p 6379 ping
  ```
- [ ] **MinIO Access**: Upload and download a test file via web interface (http://localhost:9000)
- [ ] **Mailpit Interface**: Access email interface at http://localhost:8025
- [ ] **Adminer Database Tool**: Access database management at http://localhost:8080

**Expected Results:**
- All services start within 30 seconds
- All health checks pass
- All service interfaces are accessible
- Database and Redis connections work
- No port conflicts or service failures

---

### SECTION 3: Build System Verification

**Test the build system and automation:**

- [ ] **Development Mode**: `pnpm dev` starts all development processes
- [ ] **Hot Reload**: Change a file and verify reload happens in <3 seconds
- [ ] **Build Performance**: `pnpm build` completes full build in <3 minutes
- [ ] **Test Runner**: `pnpm test` executes test suite (even if no tests exist yet)
- [ ] **Incremental Builds**: Second build completes much faster (caching works)
- [ ] **Clean Build**: `pnpm clean && pnpm build` works correctly

**Expected Results:**
- Development mode provides fast iteration
- Build system is performant and reliable
- Caching optimizations are effective
- All build commands work as documented

---

### SECTION 4: Code Quality Verification

**Test code quality tools and standards:**

- [ ] **ESLint Configuration**: Create a test file with intentional linting errors
  ```typescript
  // test-file.ts
  const unused_variable = "test";  // Should trigger unused variable error
  console.log("hello")             // Should trigger missing semicolon
  ```
- [ ] **Prettier Formatting**: Create an unformatted file and run `pnpm format`
- [ ] **TypeScript Strictness**: Create a file with type errors and verify they're caught
- [ ] **Import Validation**: Test that cross-package imports work and are validated
- [ ] **Consistent Configuration**: Verify all packages use the same linting rules

**Expected Results:**
- ESLint catches all code quality issues
- Prettier formats code consistently
- TypeScript enforces strict typing
- Import paths are validated and optimized
- Configuration is consistent across packages

---

### SECTION 5: CI/CD Pipeline Verification

**Test the automated quality assurance pipeline:**

- [ ] **PR Creation**: Create a test pull request with clean code
- [ ] **CI Pipeline Success**: Verify all CI jobs pass (lint, test, build, security)
- [ ] **Error Detection**: Create a PR with intentional errors (linting, TypeScript)
- [ ] **Security Scanning**: Verify security scans complete without critical issues
- [ ] **Build Artifacts**: Check that build produces expected outputs
- [ ] **Pipeline Performance**: Total CI runtime is <10 minutes

**Expected Results:**
- CI pipeline reliably detects code quality issues
- All security scans pass
- Pipeline performance meets targets
- Build artifacts are generated correctly
- Failed builds block merging appropriately

---

### SECTION 6: Documentation Verification

**Test the documentation and onboarding experience:**

- [ ] **README Completeness**: README provides clear project overview and quick start
- [ ] **Setup Instructions**: Follow README setup guide on fresh machine
- [ ] **Contribution Guidelines**: CONTRIBUTING.md is clear and actionable
- [ ] **Troubleshooting Guide**: Common issues and solutions are documented
- [ ] **API Documentation**: Initial API documentation structure exists
- [ ] **Architecture Overview**: High-level architecture is documented

**Expected Results:**
- Documentation enables <30 minute onboarding
- Setup instructions are complete and accurate
- Troubleshooting covers common issues
- Documentation is well-organized and findable

---

### SECTION 7: Performance Verification

**Verify performance targets are met:**

- [ ] **Installation Speed**: `pnpm install` completes in <2 minutes
- [ ] **Startup Speed**: `pnpm dev:start` starts services in <30 seconds
- [ ] **Build Speed**: Full build completes in <3 minutes
- [ ] **Hot Reload Speed**: Code changes reflect in <3 seconds
- [ ] **Memory Usage**: Development environment uses reasonable memory (<2GB total)
- [ ] **CPU Usage**: Idle development environment has low CPU usage (<10%)

**Expected Results:**
- All performance targets are met
- Resource usage is reasonable for development
- Development workflow is fast and responsive

---

### SECTION 8: Security Verification

**Verify security measures are in place:**

- [ ] **Secret Management**: No secrets committed to repository
- [ ] **Dependency Security**: Security audit passes with no critical issues
- [ ] **Service Security**: Services use secure default configurations
- [ ] **Access Controls**: Appropriate access controls for sensitive operations
- [ ] **HTTPS/TLS**: Secure connections where appropriate
- [ ] **Input Validation**: Basic input validation frameworks in place

**Expected Results:**
- No security credentials in repository
- Dependencies pass security audit
- Services follow security best practices
- Foundation security is properly established

---

### VERIFICATION COMPLETION CRITERIA

**Phase 0 is considered COMPLETE when:**

✅ **All verification sections pass without exceptions**  
✅ **New team member can onboard in <30 minutes using only documentation**  
✅ **Development environment is reliable and performant**  
✅ **Quality automation catches issues consistently**  
✅ **Security foundations are properly established**  
✅ **Performance targets are met under normal usage**  

**Phase 0 is considered FAILED if:**

❌ **Any service fails to start reliably**  
❌ **CI/CD pipeline has frequent failures or timeouts**  
❌ **Build times exceed performance targets significantly**  
❌ **Documentation is incomplete or leads to setup failures**  
❌ **Security scanning reveals critical vulnerabilities**  
❌ **Cross-package dependencies are broken**  

---

### ROLLBACK PROCEDURES

**If verification fails:**

1. **Document Issues**: Record specific failures and their symptoms
2. **Assess Impact**: Determine if issues are fixable within 2 days
3. **Fix vs Restart Decision**:
   - **Minor Issues** (<4 hours to fix): Fix and re-verify
   - **Major Issues** (>1 day to fix): Consider starting Phase 0 over
   - **Fundamental Problems** (>2 days to fix): Restart with lessons learned

4. **Re-verification**: Complete full verification process after fixes
5. **Update Procedures**: Improve implementation procedures based on failures

---

### NEXT STEPS

**Upon successful verification:**
1. **Document Success**: Record completion date and verification results
2. **Team Communication**: Notify team that Phase 0 is complete
3. **Environment Handoff**: Ensure all team members can use the environment
4. **Phase 1 Preparation**: Begin Phase 1 planning and preparation
5. **Celebrate**: Acknowledge the solid foundation that's been built

**Verification Sign-off:**
- [ ] Verification completed by: _________________ Date: _________
- [ ] All criteria met: Yes / No
- [ ] Ready for Phase 1: Yes / No
- [ ] Issues identified: ________________________________
```