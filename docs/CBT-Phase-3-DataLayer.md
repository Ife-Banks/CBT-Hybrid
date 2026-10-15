# CBT Platform — Phase 3: Data Layer & ORM

**Version:** 1.0  
**Date:** October 14, 2026  
**Phase Duration:** 5-7 days  
**Team Size:** 2 developers (1 database specialist)  
**Risk Level:** Low  
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

Phase 3 implements the **data access layer** for the CBT Platform, establishing database connections, entity definitions, and repository patterns that will support all subsequent business logic phases.

### 1.2 Key Deliverables

| Deliverable | Description | Success Criteria |
|-------------|-------------|------------------|
| **Database Connections** | PostgreSQL (cloud) and SQLite (school) setup | Connections work reliably |
| **TypeORM Entities** | All database table representations | Entities match schema exactly |
| **Repository Layer** | Data access patterns and transactions | CRUD operations work correctly |
| **Migration System** | Database schema versioning | Migrations run up/down successfully |
| **Seed Data System** | Test and demo data population | Consistent seed data generation |
| **Query Optimization** | Indexes and query performance | Performance targets met |

### 1.3 Database Architecture

**Dual Database Strategy:**
- **PostgreSQL (Cloud)**: Full relational database with advanced features
- **SQLite (School Server)**: Lightweight, embedded database for offline operation

**Data Synchronization:**
- School server maintains subset of cloud data
- Bidirectional sync for exam results and student progress
- Conflict resolution for concurrent modifications

### 1.4 Success Criteria

✅ **Database connections stable and performant**  
✅ **All entities properly mapped to database schema**  
✅ **Repository pattern provides clean data access**  
✅ **Migrations handle schema changes safely**  
✅ **Query performance meets response time targets**  
✅ **Both PostgreSQL and SQLite work identically**  

---

## 2. Phase Story

### 2.1 The Data Foundation Challenge

Every feature in the CBT Platform depends on reliable, fast data access. Student records, question banks, exam results—all must be stored securely and retrieved instantly. Phase 3 builds the **data foundation** that everything else relies on.

### 2.2 What We're Building

**The Database Connection Layer**  
Robust connections to both PostgreSQL (for cloud operations) and SQLite (for school servers) with automatic failover, connection pooling, and health monitoring.

**The Entity Relationship System**  
Complete TypeORM entities that map every table from the database architecture, ensuring type safety from database to application layer.

**The Repository Pattern**  
Clean, testable data access layer that abstracts database operations behind intuitive methods, making complex queries simple for business logic.

**The Migration Framework**  
Version-controlled schema changes that can be applied and rolled back safely, supporting both development iterations and production deployments.

### 2.3 Why This Phase Matters

**Data Integrity**: Proper entity relationships and constraints prevent data corruption and maintain referential integrity across complex exam workflows.

**Performance**: Optimized queries and proper indexing ensure that searching thousands of questions or loading exam results happens instantly.

**Reliability**: Connection pooling and error handling prevent database issues from causing application failures during critical exam periods.

**Maintainability**: The repository pattern isolates data access logic, making the codebase easier to test, debug, and modify as requirements evolve.

### 2.4 Phase Success Story

When Phase 3 is complete:

**For Developers:**
- Clean, type-safe data access methods
- Automatic query optimization and caching
- Simple testing with in-memory databases
- Clear separation of concerns

**For the System:**
- Fast, reliable data operations
- Consistent behavior across cloud and school environments
- Automatic schema synchronization
- Robust error handling and recovery
---

## 3. Implementation Prompt

```markdown
## IMPLEMENTATION PROMPT: Phase 3 - Data Layer & ORM

**CONTEXT:** You are implementing the data access layer for the CBT Platform. The core infrastructure from Phase 1 is complete. You need to establish database connections, entity mappings, and repository patterns that will support all business logic.

**OBJECTIVE:** Create a robust, performant data layer that works identically with PostgreSQL (cloud) and SQLite (school server) while providing clean abstractions for business logic.

---

### TASK 1: Database Connection Setup

**Configure TypeORM for dual database support:**

```typescript
// apps/cloud-api/src/shared/database/database.module.ts
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST'),
        port: configService.get('DATABASE_PORT'),
        username: configService.get('DATABASE_USERNAME'),
        password: configService.get('DATABASE_PASSWORD'),
        database: configService.get('DATABASE_NAME'),
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: false, // Always use migrations in production
        logging: configService.get('NODE_ENV') === 'development',
        
        // Connection pooling configuration
        extra: {
          connectionLimit: 20,
          acquireTimeout: 30000,
          timeout: 30000,
          reconnect: true,
        },
        
        // SSL configuration for production
        ssl: configService.get('DATABASE_SSL') ? {
          rejectUnauthorized: false
        } : false,
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
```

**School Server SQLite Configuration:**
```typescript
// apps/school-server/src/shared/database/database.module.ts
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'sqlite',
        database: configService.get('SQLITE_DATABASE_PATH', 'data/school.db'),
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: false,
        
        // WAL mode for better concurrency
        extra: {
          pragma: {
            journal_mode: 'WAL',
            synchronous: 'NORMAL',
            cache_size: -64000, // 64MB cache
            temp_store: 'MEMORY',
          }
        }
      }),
      inject: [ConfigService],
    }),
  ],
})
export class SchoolDatabaseModule {}
```

**Requirements:**
- Connection pooling for PostgreSQL (20 connections max)
- WAL mode for SQLite performance
- Health checks for both database types
- Automatic reconnection handling
- Environment-specific configuration

**Files to Create:**
- apps/cloud-api/src/shared/database/database.module.ts
- apps/school-server/src/shared/database/school-database.module.ts
- apps/cloud-api/src/shared/database/database.health.ts
- packages/shared-types/src/config/database.config.ts

---

### TASK 2: Entity Definitions

**Create TypeORM entities matching the database schema:**

**User Entity:**
```typescript
// packages/shared-types/src/entities/user.entity.ts
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  firstName: string;

  @Column({ type: 'varchar', length: 255 })
  lastName: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ type: 'uuid' })
  schoolId: string;

  @Column({ type: 'jsonb', nullable: true })
  preferences: UserPreferences;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Relationships
  @ManyToOne(() => School, school => school.users)
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @OneToMany(() => Question, question => question.author)
  questions: Question[];

  @OneToMany(() => ExamSession, session => session.student)
  examSessions: ExamSession[];
}
```

**Question Entity:**
```typescript
// packages/shared-types/src/entities/question.entity.ts
@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: QuestionType })
  type: QuestionType;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb' })
  options: QuestionOption[];

  @Column({ type: 'jsonb' })
  answerKey: AnswerKey;

  @Column({ type: 'integer' })
  marks: number;

  @Column({ type: 'varchar', length: 50 })
  difficulty: string;

  @Column({ type: 'uuid' })
  subjectId: string;

  @Column({ type: 'uuid' })
  authorId: string;

  @Column({ type: 'varchar', array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata: QuestionMetadata;

  @Column({ type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.PENDING })
  approvalStatus: ApprovalStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Subject, subject => subject.questions)
  @JoinColumn({ name: 'subjectId' })
  subject: Subject;

  @ManyToOne(() => User, user => user.questions)
  @JoinColumn({ name: 'authorId' })
  author: User;

  @ManyToMany(() => Exam, exam => exam.questions)
  exams: Exam[];

  @OneToMany(() => QuestionMedia, media => media.question)
  mediaFiles: QuestionMedia[];
}
```

**Exam Entity:**
```typescript
// packages/shared-types/src/entities/exam.entity.ts
@Entity('exams')
export class Exam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'uuid' })
  subjectId: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @Column({ type: 'jsonb' })
  settings: ExamSettings;

  @Column({ type: 'enum', enum: ExamStatus, default: ExamStatus.DRAFT })
  status: ExamStatus;

  @Column({ type: 'integer' })
  totalMarks: number;

  @Column({ type: 'integer', nullable: true })
  timeLimit: number; // minutes

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date;

  // Relationships
  @ManyToOne(() => Subject, subject => subject.exams)
  @JoinColumn({ name: 'subjectId' })
  subject: Subject;

  @ManyToOne(() => School, school => school.exams)
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @ManyToOne(() => User, user => user.createdExams)
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @ManyToMany(() => Question, question => question.exams)
  @JoinTable({
    name: 'exam_questions',
    joinColumn: { name: 'examId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'questionId', referencedColumnName: 'id' }
  })
  questions: Question[];

  @OneToMany(() => ExamSitting, sitting => sitting.exam)
  sittings: ExamSitting[];
}
```

**Files to Create:**
- packages/shared-types/src/entities/user.entity.ts
- packages/shared-types/src/entities/school.entity.ts
- packages/shared-types/src/entities/question.entity.ts
- packages/shared-types/src/entities/exam.entity.ts
- packages/shared-types/src/entities/exam-session.entity.ts
- packages/shared-types/src/entities/student-code.entity.ts
- packages/shared-types/src/entities/answer.entity.ts

---

### TASK 3: Repository Layer

**Implement repository pattern for clean data access:**

```typescript
// apps/cloud-api/src/shared/database/base.repository.ts
export abstract class BaseRepository<T> {
  constructor(
    protected readonly repository: Repository<T>,
    protected readonly logger: Logger,
  ) {}

  async findById(id: string): Promise<T | null> {
    try {
      return await this.repository.findOne({ where: { id } as any });
    } catch (error) {
      this.logger.error(`Error finding entity by id ${id}:`, error);
      throw new DatabaseException('Entity not found', error);
    }
  }

  async findAll(options?: FindManyOptions<T>): Promise<T[]> {
    try {
      return await this.repository.find(options);
    } catch (error) {
      this.logger.error('Error finding entities:', error);
      throw new DatabaseException('Query failed', error);
    }
  }

  async create(entity: DeepPartial<T>): Promise<T> {
    try {
      const created = this.repository.create(entity);
      return await this.repository.save(created);
    } catch (error) {
      this.logger.error('Error creating entity:', error);
      throw new DatabaseException('Create failed', error);
    }
  }

  async update(id: string, updates: QueryDeepPartialEntity<T>): Promise<T> {
    try {
      await this.repository.update(id, updates);
      const updated = await this.findById(id);
      if (!updated) {
        throw new NotFoundException(`Entity with id ${id} not found`);
      }
      return updated;
    } catch (error) {
      this.logger.error(`Error updating entity ${id}:`, error);
      throw new DatabaseException('Update failed', error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const result = await this.repository.delete(id);
      if (result.affected === 0) {
        throw new NotFoundException(`Entity with id ${id} not found`);
      }
    } catch (error) {
      this.logger.error(`Error deleting entity ${id}:`, error);
      throw new DatabaseException('Delete failed', error);
    }
  }
}
```

**Question Repository:**
```typescript
// apps/cloud-api/src/modules/questions/question.repository.ts
@Injectable()
export class QuestionRepository extends BaseRepository<Question> {
  constructor(
    @InjectRepository(Question)
    repository: Repository<Question>,
    logger: Logger,
  ) {
    super(repository, logger);
  }

  async findBySubject(subjectId: string, options?: QuestionQueryOptions): Promise<Question[]> {
    const query = this.repository
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.subject', 'subject')
      .leftJoinAndSelect('question.author', 'author')
      .where('question.subjectId = :subjectId', { subjectId });

    if (options?.difficulty) {
      query.andWhere('question.difficulty = :difficulty', { difficulty: options.difficulty });
    }

    if (options?.type) {
      query.andWhere('question.type = :type', { type: options.type });
    }

    if (options?.tags?.length) {
      query.andWhere('question.tags && :tags', { tags: options.tags });
    }

    if (options?.approvalStatus) {
      query.andWhere('question.approvalStatus = :status', { status: options.approvalStatus });
    }

    return query.getMany();
  }

  async searchQuestions(searchTerm: string, schoolId: string): Promise<Question[]> {
    return this.repository
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.subject', 'subject')
      .leftJoinAndSelect('question.author', 'author')
      .where('question.content ILIKE :searchTerm', { searchTerm: `%${searchTerm}%` })
      .andWhere('author.schoolId = :schoolId', { schoolId })
      .orderBy('question.createdAt', 'DESC')
      .limit(50)
      .getMany();
  }

  async findRandomQuestions(criteria: RandomQuestionCriteria): Promise<Question[]> {
    const query = this.repository
      .createQueryBuilder('question')
      .where('question.subjectId = :subjectId', { subjectId: criteria.subjectId })
      .andWhere('question.approvalStatus = :status', { status: ApprovalStatus.APPROVED });

    if (criteria.difficulty) {
      query.andWhere('question.difficulty = :difficulty', { difficulty: criteria.difficulty });
    }

    if (criteria.type) {
      query.andWhere('question.type = :type', { type: criteria.type });
    }

    return query
      .orderBy('RANDOM()')
      .limit(criteria.count)
      .getMany();
  }
}
```

**Files to Create:**
- apps/cloud-api/src/shared/database/base.repository.ts
- apps/cloud-api/src/modules/questions/question.repository.ts
- apps/cloud-api/src/modules/exams/exam.repository.ts
- apps/cloud-api/src/modules/users/user.repository.ts
- apps/cloud-api/src/modules/students/student.repository.ts

---

### TASK 4: Migration System

**Setup database migrations for schema management:**

```typescript
// Migration example: Initial schema
// apps/cloud-api/src/shared/database/migrations/1697292000000-InitialSchema.ts
export class InitialSchema1697292000000 implements MigrationInterface {
  name = 'InitialSchema1697292000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create schools table
    await queryRunner.createTable(
      new Table({
        name: 'schools',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
          { name: 'name', type: 'varchar', length: '255' },
          { name: 'code', type: 'varchar', length: '10', isUnique: true },
          { name: 'address', type: 'text', isNullable: true },
          { name: 'contactEmail', type: 'varchar', length: '255' },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    // Create users table
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
          { name: 'email', type: 'varchar', length: '255', isUnique: true },
          { name: 'firstName', type: 'varchar', length: '255' },
          { name: 'lastName', type: 'varchar', length: '255' },
          { name: 'passwordHash', type: 'varchar', length: '255' },
          { name: 'role', type: 'enum', enum: ['platform_owner', 'school_admin', 'teacher', 'parent', 'student'] },
          { name: 'schoolId', type: 'uuid' },
          { name: 'preferences', type: 'jsonb', isNullable: true },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'lastLoginAt', type: 'timestamp', isNullable: true },
        ],
      }),
      true,
    );

    // Add foreign key constraints
    await queryRunner.createForeignKey(
      'users',
      new ForeignKey({
        columnNames: ['schoolId'],
        referencedTableName: 'schools',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );

    // Create indexes for performance
    await queryRunner.createIndex(
      'users',
      new Index({
        name: 'IDX_users_email',
        columnNames: ['email'],
      }),
    );

    await queryRunner.createIndex(
      'users',
      new Index({
        name: 'IDX_users_school_role',
        columnNames: ['schoolId', 'role'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
    await queryRunner.dropTable('schools');
  }
}
```

**Migration Commands:**
```bash
# Generate new migration
npm run migration:generate -- --name AddQuestionTables

# Run migrations
npm run migration:run

# Rollback migration
npm run migration:revert
```

**Files to Create:**
- apps/cloud-api/src/shared/database/migrations/1697292000000-InitialSchema.ts
- apps/cloud-api/src/shared/database/migrations/1697292100000-QuestionTables.ts
- apps/cloud-api/src/shared/database/migrations/1697292200000-ExamTables.ts
- scripts/migration-generate.sh
- scripts/migration-run.sh

---

### IMPLEMENTATION CHECKLIST

**Before considering Phase 3 complete:**

- [ ] **Database Connections**:
  - PostgreSQL connection with pooling works
  - SQLite connection with WAL mode works
  - Health checks report database status
  - Connection recovery handles failures

- [ ] **Entity Definitions**:
  - All entities match database schema exactly
  - Relationships properly configured
  - TypeScript types generated correctly
  - Validation decorators applied

- [ ] **Repository Layer**:
  - CRUD operations work for all entities
  - Complex queries perform well
  - Error handling is comprehensive
  - Logging provides debugging info

- [ ] **Migrations**:
  - Initial schema migration works
  - Up and down migrations tested
  - Production migration strategy defined
  - Database seeding works

---

### ACCEPTANCE CRITERIA

**Phase 3 is complete when:**
✅ Both PostgreSQL and SQLite connections work reliably  
✅ All entities properly map to database schema  
✅ Repository pattern provides clean, testable data access  
✅ Migrations can be applied and rolled back safely  
✅ Query performance meets response time targets  
✅ Error handling prevents data corruption  

**Performance Targets:**
- Simple queries: <50ms response time
- Complex joins: <200ms response time
- Batch operations: <500ms for 100 records
- Connection establishment: <100ms

---

**NEXT STEPS:** After implementation, proceed to Independent Verification Prompt to validate data layer before Phase 4.
```

---

## 4. Independent Verification Prompt

```markdown
## VERIFICATION PROMPT: Phase 3 Data Layer Complete

**OBJECTIVE:** Verify that the data layer provides reliable, performant access to both PostgreSQL and SQLite databases with proper entity mappings and query optimization.

**VERIFICATION APPROACH:** Test database operations, performance, and reliability under various conditions including connection failures and concurrent access.

---

### SECTION 1: Database Connection Verification

- [ ] **PostgreSQL Connection Testing**:
  ```bash
  # Test connection establishment
  psql postgresql://cbt_app:password@localhost:5432/cbt_cloud -c "SELECT version();"
  
  # Test connection pooling
  curl /health/database
  # Should show connection pool status
  
  # Test connection recovery (disconnect network, reconnect)
  # Application should recover gracefully
  ```

- [ ] **SQLite Connection Testing**:
  ```bash
  # Test SQLite database creation
  ls -la data/school.db
  
  # Test WAL mode enabled
  sqlite3 data/school.db "PRAGMA journal_mode;"
  # Should return "wal"
  
  # Test concurrent access
  # Multiple processes should be able to read simultaneously
  ```

**Expected Results:**
- Both databases connect reliably
- Connection pooling works correctly
- WAL mode improves SQLite performance
- Health checks report accurate status

---

### SECTION 2: Entity Mapping Verification

- [ ] **Entity-Database Schema Alignment**:
  ```typescript
  // Test entity creation matches database schema
  const user = new User();
  user.email = "test@example.com";
  user.firstName = "Test";
  user.lastName = "User";
  // Should save without validation errors
  
  // Test relationship loading
  const userWithSchool = await userRepository.findOne({
    relations: ['school']
  });
  // Should load related school data
  ```

- [ ] **Data Type Validation**:
  ```typescript
  // Test JSONB fields work correctly
  const question = new Question();
  question.options = [
    { id: 'A', text: 'Option A' },
    { id: 'B', text: 'Option B' }
  ];
  // Should save and retrieve JSON correctly
  ```

**Expected Results:**
- All entity fields map correctly to database columns
- Relationships load properly
- JSON fields serialize/deserialize correctly
- Database constraints are enforced

---

### SECTION 3: Repository Pattern Verification

- [ ] **CRUD Operations Testing**:
  ```typescript
  // Test create operation
  const question = await questionRepository.create({
    type: QuestionType.SINGLE_CHOICE,
    content: 'Test question',
    options: [...],
    answerKey: {...}
  });
  
  // Test read operation
  const retrieved = await questionRepository.findById(question.id);
  assert(retrieved.content === 'Test question');
  
  // Test update operation
  const updated = await questionRepository.update(question.id, {
    content: 'Updated question'
  });
  assert(updated.content === 'Updated question');
  
  // Test delete operation
  await questionRepository.delete(question.id);
  const deleted = await questionRepository.findById(question.id);
  assert(deleted === null);
  ```

- [ ] **Complex Query Testing**:
  ```typescript
  // Test search functionality
  const results = await questionRepository.searchQuestions('mathematics', schoolId);
  assert(results.length > 0);
  
  // Test filtered queries
  const filtered = await questionRepository.findBySubject(subjectId, {
    difficulty: 'medium',
    type: QuestionType.SINGLE_CHOICE
  });
  
  // Test random selection
  const random = await questionRepository.findRandomQuestions({
    subjectId: subjectId,
    count: 10,
    difficulty: 'easy'
  });
  assert(random.length === 10);
  ```

**Expected Results:**
- All CRUD operations work correctly
- Complex queries return expected results
- Error handling prevents data corruption
- Repository methods are intuitive to use

---

### SECTION 4: Migration System Verification

- [ ] **Migration Execution Testing**:
  ```bash
  # Test fresh database migration
  npm run migration:run
  # Should create all tables and indexes
  
  # Test migration rollback
  npm run migration:revert
  # Should cleanly remove last migration
  
  # Test re-running migrations
  npm run migration:run
  # Should work idempotently
  ```

- [ ] **Schema Consistency Testing**:
  ```bash
  # Compare entity definitions to actual database schema
  npm run schema:sync --dry-run
  # Should show no differences
  ```

**Expected Results:**
- Migrations run without errors
- Rollbacks work cleanly
- Schema matches entity definitions exactly
- No data loss during migrations

---

### SECTION 5: Performance Verification

- [ ] **Query Performance Testing**:
  ```typescript
  // Test simple query performance (<50ms)
  const start = performance.now();
  await userRepository.findById(userId);
  const time = performance.now() - start;
  assert(time < 50, `Query too slow: ${time}ms`);
  
  // Test complex query performance (<200ms)
  const start2 = performance.now();
  await questionRepository.findBySubject(subjectId, { 
    difficulty: 'medium' 
  });
  const time2 = performance.now() - start2;
  assert(time2 < 200, `Complex query too slow: ${time2}ms`);
  
  // Test batch operations (<500ms for 100 records)
  const start3 = performance.now();
  const questions = [];
  for (let i = 0; i < 100; i++) {
    questions.push(createTestQuestion());
  }
  await questionRepository.createMany(questions);
  const time3 = performance.now() - start3;
  assert(time3 < 500, `Batch operation too slow: ${time3}ms`);
  ```

- [ ] **Concurrent Access Testing**:
  ```typescript
  // Test multiple simultaneous database operations
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(questionRepository.findById(questionId));
  }
  const results = await Promise.all(promises);
  // All should succeed without errors
  ```

**Expected Results:**
- Simple queries: <50ms
- Complex queries: <200ms  
- Batch operations: <500ms for 100 records
- Concurrent access works without conflicts

---

### VERIFICATION COMPLETION CRITERIA

**Phase 3 is COMPLETE when:**

✅ **Database connections are stable and performant**  
✅ **All entity mappings work correctly**  
✅ **Repository pattern provides clean data access**  
✅ **Migrations handle schema changes safely**  
✅ **Performance targets are met consistently**  
✅ **Both PostgreSQL and SQLite work identically**  

**Phase 3 FAILED if:**

❌ **Database connections are unreliable**  
❌ **Entity-schema mismatches exist**  
❌ **Query performance below targets**  
❌ **Migration failures or data loss**  
❌ **Repository methods cause errors**  
❌ **Concurrent access issues**  

---

### PERFORMANCE VERIFICATION SUMMARY

| Operation | Target | Actual | Pass/Fail |
|-----------|--------|--------|-----------|
| Simple queries | <50ms | ___ms | ___ |
| Complex queries | <200ms | ___ms | ___ |
| Batch operations (100 records) | <500ms | ___ms | ___ |
| Connection establishment | <100ms | ___ms | ___ |
| PostgreSQL health check | <50ms | ___ms | ___ |
| SQLite health check | <25ms | ___ms | ___ |

---

**Verification Sign-off:**
- [ ] Database connections verified: PostgreSQL / SQLite / Both working
- [ ] Entity mappings verified: All correct / Issues found
- [ ] Performance targets met: Yes / No
- [ ] Migration system tested: Success / Issues
- [ ] Ready for Phase 4: Yes / No
```