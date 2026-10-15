# CBT Platform — Phase 2: Authentication & Authorization

**Version:** 1.0  
**Date:** October 14, 2026  
**Phase Duration:** 7-10 days  
**Team Size:** 2-3 developers (1 security specialist)  
**Risk Level:** Medium  
**Dependencies:** Phase 1 complete  

---

## Table of Contents

1. [Phase Overview](#1-phase-overview)
2. [Phase Story](#2-phase-story)
3. [Implementation Prompt](#3-implementation-prompt)
4. [Independent Verification Prompt](#4-independent-verification-prompt)

---

## 1. Phase Overview

### 1.1 Phase Goals

Phase 2 implements **secure authentication and role-based authorization** for the CBT Platform. This phase establishes the security foundation that protects student data, exam content, and ensures proper access controls across all user types.

### 1.2 Key Deliverables

| Deliverable | Description | Success Criteria |
|-------------|-------------|------------------|
| **Multi-Factor Authentication** | TOTP-based 2FA with recovery codes | MFA setup and verification works |
| **Role-Based Authorization** | CASL permissions for all user types | Authorization matrix tests pass |
| **Session Management** | Secure session handling with cleanup | Sessions work, expire, and cleanup |
| **Password Security** | Argon2id hashing with policies | Strong password enforcement |
| **Risk Assessment** | Login risk evaluation engine | Risk scoring works accurately |
| **Security Middleware** | Guards, rate limiting, audit logging | All security controls active |

### 1.3 User Roles & Permissions

| Role | Permissions | Key Restrictions |
|------|-------------|------------------|
| **Platform Owner** | Full system access | Cannot be locked by schools |
| **School Admin** | School-wide management | Only their school's data |
| **Teacher** | Class and subject management | Only assigned classes/subjects |
| **Parent/Guardian** | Child progress viewing | Only linked children |
| **Student** | Exam taking | Only assigned exams |

### 1.4 Success Criteria

✅ **All authentication flows work securely**  
✅ **Role-based permissions properly enforced**  
✅ **Multi-factor authentication prevents unauthorized access**  
✅ **Password policies prevent weak credentials**  
✅ **Session management prevents hijacking**  
✅ **Risk assessment identifies suspicious activity**  

---

## 2. Phase Story

### 2.1 The Security Challenge

The CBT Platform handles sensitive student data, valuable exam content, and critical assessment results. A security breach could:
- Expose student privacy information
- Compromise exam integrity 
- Allow unauthorized access to results
- Damage institutional trust and compliance

Phase 2 builds the **security fortress** that protects all stakeholders.

### 2.2 What We're Building

**The Authentication Engine**  
Multi-layered authentication supporting passwords, two-factor authentication, and risk-based assessment. Every login is evaluated for suspicious patterns while maintaining smooth user experience for legitimate users.

**The Authorization System**  
Fine-grained role-based permissions using CASL (Code Access Security Library). Teachers can only see their assigned classes, parents only see their children's data, and school admins cannot access other schools' information.

**The Session Security System**  
Secure session management with automatic cleanup, concurrent session limits, and protection against session hijacking. Students taking exams get uninterrupted sessions, while inactive administrative sessions expire automatically.

**The Risk Assessment Engine**  
Intelligent monitoring that flags unusual login patterns—like a teacher logging in from a different country or unusual time patterns—without creating friction for normal usage.

### 2.3 Security Architecture

**Defense in Depth:**
1. **Network Level**: Rate limiting and DDoS protection
2. **Application Level**: Input validation and output encoding
3. **Authentication Level**: Multi-factor verification
4. **Authorization Level**: Role-based access controls
5. **Session Level**: Secure session management
6. **Audit Level**: Comprehensive security logging

**Zero Trust Principles:**
- Every request is authenticated
- Every action is authorized
- Every access is logged
- Every session is validated

### 2.4 Phase Success Story

When Phase 2 is complete:

**For Students:**
- Simple, secure login with student codes
- Uninterrupted exam sessions
- Protection of personal academic data

**For Teachers:**
- Secure access to only relevant classes and subjects
- Protection against unauthorized data access
- Smooth workflow with appropriate permissions

**For Administrators:**
- Complete school oversight with security boundaries
- Audit trails for compliance requirements
- Risk alerts for suspicious activity

**For the System:**
- Comprehensive protection against security threats
- Compliance with education data privacy regulations
- Foundation for secure feature development
---

## 3. Implementation Prompt

```markdown
## IMPLEMENTATION PROMPT: Phase 2 - Authentication & Authorization

**CONTEXT:** You are implementing the security layer for the CBT Platform. The core infrastructure from Phase 1 is complete and working. You need to build enterprise-grade authentication and authorization that protects student data while maintaining usable workflows.

**OBJECTIVE:** Create secure, performant authentication and authorization systems that support all user types (platform owners, school admins, teachers, parents, students) with appropriate access controls and security monitoring.

---

### TASK 1: Core Authentication Service

**Create comprehensive authentication with multi-factor support:**

**Authentication Service Structure:**
```typescript
// apps/cloud-api/src/modules/auth/
├── auth.module.ts           # Authentication module
├── auth.controller.ts       # Login/logout endpoints
├── auth.service.ts          # Core authentication logic
├── password.service.ts      # Password hashing and validation
├── mfa.service.ts           # Multi-factor authentication
├── session.service.ts       # Session management
├── risk-assessment.service.ts # Login risk evaluation
└── dto/                     # Request/response DTOs
    ├── login.dto.ts
    ├── mfa-setup.dto.ts
    └── password-reset.dto.ts
```

**Requirements:**

1. **Password Security Implementation:**
   ```typescript
   export class PasswordService {
     // Use Argon2id with these exact parameters for security/performance balance
     private readonly ARGON2_OPTIONS = {
       memoryCost: 19456,    # 19MB memory
       timeCost: 2,          # 2 iterations  
       parallelism: 1        # 1 thread
     };
     
     async hashPassword(password: string): Promise<string>;
     async verifyPassword(password: string, hash: string): Promise<boolean>;
     validatePasswordStrength(password: string): ValidationResult;
   }
   
   // Password Policy Requirements:
   // - Minimum 10 characters
   // - At least 3 of: lowercase, uppercase, numbers, symbols
   // - Cannot contain user's name or email
   // - Cannot be in common password list (top 10,000)
   // - Cannot reuse last 5 passwords
   ```

2. **Authentication Flow:**
   ```typescript
   export class AuthService {
     async authenticate(credentials: LoginCredentials, context: AuthContext): Promise<AuthResult> {
       // 1. Rate limiting check (5 attempts per 15 minutes)
       // 2. User lookup and status validation
       // 3. Password verification (timing attack protection)
       // 4. Risk assessment calculation
       // 5. MFA requirement check
       // 6. Session creation and token generation
     }
     
     async refreshTokens(refreshToken: string): Promise<TokenPair> {
       // Validate refresh token and generate new access token
     }
     
     async logout(sessionId: string): Promise<void> {
       // Revoke session and cleanup
     }
   }
   ```

3. **Multi-Factor Authentication:**
   ```typescript
   export class MFAService {
     async setupTOTP(userId: string): Promise<{ secret: string; qrCodeUrl: string }> {
       // Generate TOTP secret and QR code for authenticator apps
     }
     
     async enableTOTP(userId: string, secret: string, token: string): Promise<string[]> {
       // Verify TOTP token and return recovery codes
     }
     
     async verifyTOTP(userId: string, token: string): Promise<boolean> {
       // Verify TOTP with 30-second window tolerance
     }
     
     async verifyRecoveryCode(userId: string, code: string): Promise<boolean> {
       // Verify and consume recovery code (one-time use)
     }
   }
   ```

4. **Session Management:**
   ```typescript
   export class SessionService {
     async createSession(user: User, context: AuthContext): Promise<Session> {
       // Create secure session with device fingerprinting
     }
     
     async validateSession(sessionId: string): Promise<Session | null> {
       // Validate active session and extend expiration
     }
     
     async revokeSession(sessionId: string): Promise<void> {
       // Revoke specific session
     }
     
     async revokeAllUserSessions(userId: string, exceptSession?: string): Promise<number> {
       // Revoke all user sessions (for password changes, etc.)
     }
     
     async cleanupExpiredSessions(): Promise<number> {
       // Background job to cleanup expired sessions
     }
   }
   ```

**Security Requirements:**
- Protection against timing attacks (constant-time operations)
- Rate limiting: 5 failed attempts → 15-minute lockout
- Session tokens: cryptographically secure random, 256-bit
- JWT access tokens: short-lived (15 minutes) with refresh capability
- Password reset: secure token generation with 1-hour expiration
- Account lockout: progressive delays for repeated failures

**Performance Requirements:**
- Authentication response time: <200ms (95th percentile)
- Password hashing time: 200-500ms (security tunable)
- Session validation: <50ms
- MFA verification: <100ms
- Token generation: <10ms

**Files to Create:**
- apps/cloud-api/src/modules/auth/auth.service.ts
- apps/cloud-api/src/modules/auth/password.service.ts
- apps/cloud-api/src/modules/auth/mfa.service.ts
- apps/cloud-api/src/modules/auth/session.service.ts
- apps/cloud-api/src/common/guards/auth.guard.ts
- apps/cloud-api/src/common/guards/mfa.guard.ts

---
### TASK 2: Authorization System with CASL

**Implement role-based permissions using CASL library:**

1. **Permission Definitions:**
   ```typescript
   // apps/cloud-api/src/modules/auth/abilities/
   
   export enum Action {
     Manage = 'manage',    // All actions
     Create = 'create',
     Read = 'read',
     Update = 'update',
     Delete = 'delete',
     Execute = 'execute',  // For exam actions
   }
   
   export enum Resource {
     User = 'User',
     Student = 'Student',
     Teacher = 'Teacher',
     School = 'School',
     Question = 'Question',
     Exam = 'Exam',
     Result = 'Result',
     Report = 'Report',
   }
   ```

2. **Role-Based Ability Factory:**
   ```typescript
   export class AbilityFactory {
     createForUser(user: User): AppAbility {
       const { can, cannot, build } = new AbilityBuilder<AppAbility>(PureAbility);
       
       switch (user.role) {
         case UserRole.PLATFORM_OWNER:
           can(Action.Manage, 'all'); // Full system access
           break;
           
         case UserRole.SCHOOL_ADMIN:
           can(Action.Manage, Resource.User, { schoolId: user.schoolId });
           can(Action.Read, Resource.Exam, { schoolId: user.schoolId });
           can(Action.Manage, Resource.Student, { schoolId: user.schoolId });
           cannot(Action.Delete, Resource.User, { role: UserRole.PLATFORM_OWNER });
           break;
           
         case UserRole.TEACHER:
           can(Action.Read, Resource.User, { id: user.id }); // Own profile
           can(Action.Read, Resource.Student, { 
             classId: { $in: user.assignedClassIds } 
           });
           can(Action.Create, Resource.Question, { 
             subjectId: { $in: user.assignedSubjectIds } 
           });
           can(Action.Update, Resource.Question, { 
             authorId: user.id,
             subjectId: { $in: user.assignedSubjectIds } 
           });
           break;
           
         case UserRole.PARENT:
           can(Action.Read, Resource.User, { id: user.id }); // Own profile
           can(Action.Read, Resource.Student, { 
             id: { $in: user.linkedChildrenIds } 
           });
           can(Action.Read, Resource.Result, { 
             studentId: { $in: user.linkedChildrenIds },
             isReleased: true 
           });
           break;
           
         case UserRole.STUDENT:
           can(Action.Read, Resource.User, { id: user.id }); // Own profile
           can(Action.Execute, Resource.Exam, { 
             assignedStudentIds: { $includes: user.id },
             isActive: true 
           });
           can(Action.Read, Resource.Result, { 
             studentId: user.id,
             isReleased: true 
           });
           break;
       }
       
       return build();
     }
   }
   ```

3. **Authorization Guards:**
   ```typescript
   @Injectable()
   export class AbilitiesGuard implements CanActivate {
     constructor(
       private reflector: Reflector,
       private abilityFactory: AbilityFactory,
     ) {}
     
     async canActivate(context: ExecutionContext): Promise<boolean> {
       const rules = this.reflector.get<RequiredRule[]>(CHECK_ABILITIES_KEY, context.getHandler()) 
         || this.reflector.get<RequiredRule[]>(CHECK_ABILITIES_KEY, context.getClass());
         
       if (!rules) return true;
       
       const { user } = context.switchToHttp().getRequest();
       const ability = this.abilityFactory.createForUser(user);
       
       return rules.every(rule => ability.can(rule.action, rule.subject));
     }
   }
   ```

4. **Permission Decorators:**
   ```typescript
   export const CheckAbilities = (...requirements: RequiredRule[]) => 
     SetMetadata(CHECK_ABILITIES_KEY, requirements);
     
   // Usage examples:
   @CheckAbilities({ action: Action.Read, subject: Resource.Student })
   @CheckAbilities({ action: Action.Create, subject: Resource.Question })
   ```

**Authorization Matrix Testing:**
Every role's permissions must be tested with these exact scenarios:

- **Platform Owner**: Can access all schools, cannot be locked by school admins
- **School Admin**: Can manage users in own school only, cannot access other schools
- **Teacher**: Can only see assigned classes/subjects, cannot see unrelated students
- **Parent**: Can only see linked children, cannot see other families
- **Student**: Can only take assigned exams, cannot see others' results

**Files to Create:**
- apps/cloud-api/src/modules/auth/abilities/ability.factory.ts
- apps/cloud-api/src/modules/auth/abilities/ability.decorator.ts
- apps/cloud-api/src/common/guards/abilities.guard.ts
- apps/cloud-api/src/common/types/permissions.ts

---

### TASK 3: Risk Assessment Engine

**Implement intelligent risk scoring for login attempts:**

```typescript
export class RiskAssessmentService {
  async calculateRisk(credentials: LoginCredentials, context: AuthContext): Promise<number> {
    const factors = await Promise.all([
      this.assessGeographicRisk(credentials.userId, context.ip),
      this.assessDeviceRisk(credentials.userId, context.userAgent),
      this.assessTemporalRisk(credentials.userId, context.timestamp),
      this.assessBehavioralRisk(credentials.userId, context),
    ]);
    
    return this.combineRiskFactors(factors);
  }
  
  private async assessGeographicRisk(userId: string, ip: string): Promise<number> {
    // Compare location to user's historical login locations
    // High risk: >1000km from previous locations
    // Medium risk: 100-1000km from previous locations
    // Low risk: Within typical geographic area
  }
  
  private async assessDeviceRisk(userId: string, userAgent: string): Promise<number> {
    // Analyze device fingerprint
    // High risk: Completely new device/browser
    // Medium risk: Known device with different characteristics
    // Low risk: Previously seen device
  }
  
  private async assessTemporalRisk(userId: string, timestamp: Date): Promise<number> {
    // Analyze login timing patterns
    // High risk: Login at unusual hours for this user
    // Medium risk: Login frequency much higher than normal
    // Low risk: Normal timing pattern
  }
}
```

**Risk Response Actions:**
- **Risk Score 0-30**: Normal login flow
- **Risk Score 31-60**: Require MFA (even if not normally required)
- **Risk Score 61-80**: Require MFA + email notification
- **Risk Score 81-100**: Block login, require admin approval

**Files to Create:**
- apps/cloud-api/src/modules/auth/risk-assessment.service.ts
- apps/cloud-api/src/modules/auth/risk-factors/geographic.ts
- apps/cloud-api/src/modules/auth/risk-factors/device.ts
- apps/cloud-api/src/modules/auth/risk-factors/temporal.ts

---

### TASK 4: Security Middleware & Monitoring

**Implement comprehensive security controls:**

1. **Rate Limiting Strategy:**
   ```typescript
   // Different limits for different endpoints
   @UseGuards(RateLimitGuard({ windowMs: 900000, max: 5 })) // 5 attempts per 15 minutes
   @Post('login')
   
   @UseGuards(RateLimitGuard({ windowMs: 60000, max: 100 })) // 100 requests per minute
   @Get('health')
   
   @UseGuards(RateLimitGuard({ windowMs: 3600000, max: 10 })) // 10 per hour
   @Post('password-reset')
   ```

2. **Security Headers:**
   ```typescript
   // Apply security headers globally
   app.use(helmet({
     contentSecurityPolicy: {
       directives: {
         defaultSrc: ["'self'"],
         styleSrc: ["'self'", "'unsafe-inline'"],
         scriptSrc: ["'self'"],
         imgSrc: ["'self'", "data:", "https:"],
       },
     },
     hsts: {
       maxAge: 31536000,
       includeSubDomains: true,
       preload: true
     }
   }));
   ```

3. **Audit Logging:**
   ```typescript
   export class AuditService {
     async logSecurityEvent(event: SecurityEvent): Promise<void> {
       // Log all security-relevant events:
       // - Login attempts (success/failure)
       // - Permission changes
       // - Password resets
       // - Account lockouts
       // - Suspicious activity
     }
     
     async logDataAccess(access: DataAccessEvent): Promise<void> {
       // Log access to sensitive data:
       // - Student records accessed
       // - Exam content viewed
       // - Results accessed
     }
   }
   ```

**Security Monitoring Requirements:**
- All authentication events logged
- Failed login attempts tracked by IP and user
- Suspicious patterns detected and alerted
- Data access audit trail maintained
- Security metrics exported for monitoring

**Files to Create:**
- apps/cloud-api/src/common/guards/rate-limit.guard.ts
- apps/cloud-api/src/modules/audit/audit.service.ts
- apps/cloud-api/src/modules/audit/audit.logger.ts
- apps/cloud-api/src/common/interceptors/security.interceptor.ts

---

### IMPLEMENTATION CHECKLIST

**Before considering Phase 2 complete:**

- [ ] **Authentication Service**:
  - Password hashing uses Argon2id with specified parameters
  - Rate limiting prevents brute force attacks
  - MFA setup and verification works correctly
  - Session management handles concurrent sessions
  - Password policies enforce strong passwords

- [ ] **Authorization System**:
  - All user roles have correct permissions
  - Authorization guards prevent unauthorized access
  - Cross-school data access properly blocked
  - Teachers can only access assigned classes/subjects
  - Parents can only see linked children's data

- [ ] **Risk Assessment**:
  - Geographic risk assessment works
  - Device fingerprinting detects new devices
  - Temporal analysis identifies unusual patterns
  - Risk scores trigger appropriate responses

- [ ] **Security Controls**:
  - Rate limiting protects all endpoints
  - Security headers prevent common attacks
  - Audit logging captures security events
  - Monitoring provides security visibility

---

### ACCEPTANCE CRITERIA

**Phase 2 is complete when:**
✅ All authentication flows work securely and perform within targets  
✅ Authorization matrix tests pass for all user roles  
✅ Multi-factor authentication prevents unauthorized access  
✅ Risk assessment accurately identifies suspicious activity  
✅ Security monitoring captures all relevant events  
✅ Password policies prevent weak credentials  

**Security Validation:**
- Penetration testing reveals no critical vulnerabilities
- Authorization bypasses impossible through API manipulation
- Session hijacking protections effective
- Rate limiting prevents abuse
- Audit logs provide complete security visibility

---

**NEXT STEPS:** After implementation, proceed to Independent Verification Prompt to validate security controls before Phase 3.
```
---

## 4. Independent Verification Prompt

```markdown
## VERIFICATION PROMPT: Phase 2 Authentication & Authorization Complete

**OBJECTIVE:** Verify that Phase 2 authentication and authorization systems are secure, performant, and correctly implement all security requirements.

**VERIFICATION APPROACH:** This verification must include security-focused testing and should ideally be performed by a security specialist or senior developer with security expertise.

---

### VERIFICATION ENVIRONMENT

**Prerequisites:**
- Phase 1 infrastructure verified and working
- Test user accounts for each role type
- Security testing tools available
- Load testing capability

**Test Data Setup:**
Create test accounts for verification:
- 1 Platform Owner account
- 2 School Admin accounts (different schools)  
- 4 Teacher accounts (different classes/subjects)
- 3 Parent accounts (with linked children)
- 10 Student accounts (various assignments)

---

### SECTION 1: Authentication Security Verification

**Test core authentication security mechanisms:**

- [ ] **Password Security Testing**:
  ```bash
  # Test password hashing performance (should be 200-500ms)
  time curl -X POST /auth/register -d '{"password": "TestPassword123!"}'
  
  # Test password policy enforcement
  curl -X POST /auth/register -d '{"password": "weak"}' # Should fail
  curl -X POST /auth/register -d '{"password": "password123"}' # Should fail (common)
  curl -X POST /auth/register -d '{"password": "TestPassword123!"}' # Should pass
  ```

- [ ] **Rate Limiting Verification**:
  ```bash
  # Test login rate limiting (5 attempts per 15 minutes)
  for i in {1..6}; do
    curl -X POST /auth/login -d '{"username": "test", "password": "wrong"}'
  done
  # 6th attempt should return 429 status
  ```

- [ ] **Timing Attack Protection**:
  ```bash
  # Login attempts with valid vs invalid users should take similar time
  time curl -X POST /auth/login -d '{"username": "valid_user", "password": "wrong"}'
  time curl -X POST /auth/login -d '{"username": "nonexistent", "password": "wrong"}'
  # Response times should be similar (within 50ms)
  ```

- [ ] **Account Lockout Testing**:
  ```bash
  # After 5 failed attempts, account should be locked for 15 minutes
  # Test that lockout persists across different IPs
  # Test that admin can manually unlock accounts
  ```

- [ ] **Session Management Testing**:
  ```typescript
  // Test concurrent session limits
  // Test session expiration
  // Test session cleanup on password change
  // Test secure session token generation (256-bit entropy)
  ```

**Expected Results:**
- Password hashing takes 200-500ms consistently
- Rate limiting blocks excessive attempts
- Timing attacks are not feasible
- Account lockouts work correctly
- Sessions are secure and properly managed

---

### SECTION 2: Multi-Factor Authentication Verification

**Test TOTP-based MFA implementation:**

- [ ] **MFA Setup Process**:
  ```bash
  # Generate TOTP secret and QR code
  curl -X POST /auth/mfa/setup -H "Authorization: Bearer $TOKEN"
  # Should return secret and QR code URL
  
  # Enable MFA with valid TOTP token
  curl -X POST /auth/mfa/enable -d '{
    "secret": "GENERATED_SECRET",
    "token": "123456"
  }'
  # Should return recovery codes
  ```

- [ ] **MFA Verification Testing**:
  ```bash
  # Test TOTP token verification (30-second window)
  # Test recovery code usage (one-time only)
  # Test MFA requirement for high-risk logins
  # Test MFA bypass attempts (should fail)
  ```

- [ ] **Recovery Code Testing**:
  ```bash
  # Use each recovery code once
  # Attempt to reuse recovery code (should fail)
  # Generate new recovery codes
  ```

**Expected Results:**
- MFA setup generates valid TOTP secrets
- TOTP verification works within 30-second window
- Recovery codes work exactly once
- MFA requirements cannot be bypassed

---

### SECTION 3: Authorization Matrix Verification

**CRITICAL: Test exact permission boundaries for each role:**

- [ ] **Platform Owner Permissions**:
  ```bash
  # Should access all schools' data
  curl -H "Authorization: Bearer $PLATFORM_TOKEN" /schools
  curl -H "Authorization: Bearer $PLATFORM_TOKEN" /schools/1/users
  curl -H "Authorization: Bearer $PLATFORM_TOKEN" /schools/2/users
  
  # Should manage global settings
  curl -X POST -H "Authorization: Bearer $PLATFORM_TOKEN" /settings/global
  
  # Cannot be locked by school admins
  curl -X POST -H "Authorization: Bearer $SCHOOL_ADMIN_TOKEN" /users/$PLATFORM_USER_ID/lock
  # Should return 403 Forbidden
  ```

- [ ] **School Admin Permissions**:
  ```bash
  # Should manage users in own school only
  curl -H "Authorization: Bearer $SCHOOL1_ADMIN_TOKEN" /schools/1/users # Should work
  curl -H "Authorization: Bearer $SCHOOL1_ADMIN_TOKEN" /schools/2/users # Should return 403
  
  # Should view all exams in own school
  curl -H "Authorization: Bearer $SCHOOL1_ADMIN_TOKEN" /schools/1/exams # Should work
  
  # Should NOT delete platform owners
  curl -X DELETE -H "Authorization: Bearer $SCHOOL_ADMIN_TOKEN" /users/$PLATFORM_USER_ID
  # Should return 403
  ```

- [ ] **Teacher Permissions**:
  ```bash
  # Should only see assigned classes
  curl -H "Authorization: Bearer $TEACHER_TOKEN" /classes/assigned # Should work
  curl -H "Authorization: Bearer $TEACHER_TOKEN" /classes/other # Should return 403
  
  # Should create questions in assigned subjects only
  curl -X POST -H "Authorization: Bearer $TEACHER_TOKEN" /questions -d '{
    "subjectId": "$ASSIGNED_SUBJECT_ID"
  }' # Should work
  
  curl -X POST -H "Authorization: Bearer $TEACHER_TOKEN" /questions -d '{
    "subjectId": "$UNASSIGNED_SUBJECT_ID"  
  }' # Should return 403
  
  # Should only edit own questions
  curl -X PUT -H "Authorization: Bearer $TEACHER_TOKEN" /questions/$OWN_QUESTION_ID
  # Should work
  
  curl -X PUT -H "Authorization: Bearer $TEACHER_TOKEN" /questions/$OTHER_TEACHER_QUESTION_ID  
  # Should return 403
  ```

- [ ] **Parent Permissions**:
  ```bash
  # Should only see linked children's data
  curl -H "Authorization: Bearer $PARENT_TOKEN" /students/$LINKED_CHILD_ID # Should work
  curl -H "Authorization: Bearer $PARENT_TOKEN" /students/$OTHER_CHILD_ID # Should return 403
  
  # Should only see released results
  curl -H "Authorization: Bearer $PARENT_TOKEN" /results?studentId=$LINKED_CHILD_ID&released=true
  # Should work
  
  curl -H "Authorization: Bearer $PARENT_TOKEN" /results?studentId=$LINKED_CHILD_ID&released=false  
  # Should return 403 or empty results
  ```

- [ ] **Student Permissions**:
  ```bash
  # Should only access assigned exams
  curl -H "Authorization: Bearer $STUDENT_TOKEN" /exams/$ASSIGNED_EXAM_ID # Should work
  curl -H "Authorization: Bearer $STUDENT_TOKEN" /exams/$UNASSIGNED_EXAM_ID # Should return 403
  
  # Should only see own released results
  curl -H "Authorization: Bearer $STUDENT_TOKEN" /results?studentId=$STUDENT_ID&released=true
  # Should work
  
  curl -H "Authorization: Bearer $STUDENT_TOKEN" /results?studentId=$OTHER_STUDENT_ID
  # Should return 403
  ```

**Expected Results:**
- Each role can only access permitted resources
- Cross-school data access properly blocked
- Permission boundaries strictly enforced
- No authorization bypasses possible

---

### SECTION 4: Risk Assessment Verification

**Test intelligent risk scoring:**

- [ ] **Geographic Risk Assessment**:
  ```bash
  # Login from user's normal location (should be low risk)
  curl -X POST /auth/login -H "X-Real-IP: $NORMAL_IP" -d '{
    "username": "test_user",
    "password": "correct_password"
  }'
  # Should have low risk score, normal flow
  
  # Login from distant location (should be high risk)  
  curl -X POST /auth/login -H "X-Real-IP: $DISTANT_IP" -d '{
    "username": "test_user", 
    "password": "correct_password"
  }'
  # Should require MFA even if not normally required
  ```

- [ ] **Device Risk Assessment**:
  ```bash
  # Login from known device
  curl -X POST /auth/login -H "User-Agent: $KNOWN_AGENT" 
  # Should be low risk
  
  # Login from completely new device
  curl -X POST /auth/login -H "User-Agent: $NEW_AGENT"
  # Should increase risk score
  ```

- [ ] **Temporal Risk Assessment**:
  ```bash
  # Login at user's normal hours
  # Login at unusual hours for this user
  # Multiple rapid login attempts
  # Should adjust risk scores appropriately
  ```

- [ ] **Risk Response Testing**:
  - Risk score 0-30: Normal login
  - Risk score 31-60: MFA required
  - Risk score 61-80: MFA + email notification  
  - Risk score 81-100: Login blocked, admin approval required

**Expected Results:**
- Risk factors are accurately assessed
- Risk scores correlate with actual risk
- Risk responses are appropriately triggered
- High-risk activities properly blocked

---

### SECTION 5: Security Controls Verification

**Test security middleware and monitoring:**

- [ ] **Security Headers Verification**:
  ```bash
  curl -I /auth/login
  # Should include:
  # - Strict-Transport-Security
  # - Content-Security-Policy  
  # - X-Content-Type-Options: nosniff
  # - X-Frame-Options: DENY
  # - X-XSS-Protection: 1; mode=block
  ```

- [ ] **Input Validation Testing**:
  ```bash
  # Test SQL injection attempts
  curl -X POST /auth/login -d '{"username": "admin\"; DROP TABLE users; --", "password": "test"}'
  # Should be safely handled
  
  # Test XSS attempts
  curl -X POST /auth/login -d '{"username": "<script>alert(1)</script>", "password": "test"}'  
  # Should be safely handled
  
  # Test oversized requests
  curl -X POST /auth/login -d "$(python -c 'print("x" * 1000000)')"
  # Should return 413 (payload too large)
  ```

- [ ] **Audit Logging Verification**:
  ```bash
  # Check audit logs include:
  # - All login attempts (success/failure)
  # - Permission changes
  # - Password resets
  # - Account lockouts
  # - Sensitive data access
  
  # Verify log format is structured and searchable
  # Verify no sensitive data (passwords, tokens) in logs
  ```

**Expected Results:**
- Security headers protect against common attacks
- Input validation prevents injection attacks
- Audit logs capture all security events
- Monitoring provides security visibility

---

### SECTION 6: Performance & Load Verification

**Test authentication performance under load:**

- [ ] **Authentication Performance**:
  ```bash
  # Single authentication (should be <200ms 95th percentile)
  time curl -X POST /auth/login -d '{"username": "test", "password": "password"}'
  
  # Concurrent authentication load test
  ab -n 1000 -c 50 -p login.json -T application/json http://localhost:3000/auth/login
  ```

- [ ] **Session Validation Performance**:
  ```bash
  # Session validation should be <50ms
  time curl -H "Authorization: Bearer $TOKEN" /auth/validate
  
  # Load test session validation  
  ab -n 10000 -c 100 -H "Authorization: Bearer $TOKEN" http://localhost:3000/auth/validate
  ```

- [ ] **MFA Performance**:
  ```bash
  # TOTP verification should be <100ms
  time curl -X POST /auth/mfa/verify -d '{"token": "123456"}'
  ```

**Expected Results:**
- Authentication: <200ms (95th percentile)
- Session validation: <50ms
- MFA verification: <100ms  
- System stable under concurrent load

---

### VERIFICATION COMPLETION CRITERIA

**Phase 2 is COMPLETE when:**

✅ **All authentication flows work securely**  
✅ **Authorization matrix passes all role tests**  
✅ **Multi-factor authentication prevents unauthorized access**  
✅ **Risk assessment accurately identifies threats**  
✅ **Security controls protect against common attacks**  
✅ **Performance targets met under load**  
✅ **Audit logging provides complete visibility**  

**Phase 2 FAILED if:**

❌ **Any authorization bypass possible**  
❌ **Authentication security vulnerabilities found**  
❌ **MFA can be circumvented**  
❌ **Performance targets not met**  
❌ **Critical security controls missing**  
❌ **Risk assessment produces false positives/negatives**  

---

### SECURITY VERIFICATION SUMMARY

| Security Control | Implementation | Test Result | Pass/Fail |
|------------------|----------------|-------------|-----------|
| Password Security | Argon2id hashing | ___ms hash time | ___ |
| Rate Limiting | 5 attempts/15min | Blocks correctly | ___ |
| Account Lockout | Progressive delays | Works as expected | ___ |
| Session Management | Secure tokens | No hijacking possible | ___ |
| MFA Implementation | TOTP + recovery | Cannot bypass | ___ |
| Authorization Matrix | CASL permissions | All roles correct | ___ |
| Risk Assessment | Multi-factor scoring | Accurate detection | ___ |
| Security Headers | Helmet.js | All headers present | ___ |
| Input Validation | Zod schemas | Injection prevented | ___ |
| Audit Logging | Structured logs | All events captured | ___ |

---

### NEXT STEPS

**Upon successful verification:**
1. **Security Sign-off**: Document all security test results
2. **Performance Baseline**: Record authentication performance metrics
3. **Phase 3 Preparation**: Begin data layer and ORM planning  
4. **Security Monitoring**: Setup ongoing security monitoring
5. **Team Training**: Ensure team understands security procedures

**Verification Sign-off:**
- [ ] Security verification completed by: _________________ Date: _________
- [ ] All authorization tests pass: Yes / No
- [ ] Security vulnerabilities: None found / Issues identified
- [ ] Performance targets met: Yes / No
- [ ] Ready for Phase 3: Yes / No
- [ ] Critical security issues: ________________________________
```