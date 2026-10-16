import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { UsersController } from './modules/users/users.controller';
import { UsersService } from './modules/users/users.service';
import { DrizzleStudentRepository } from './modules/users/repositories';
import { QuestionsController } from './modules/questions/questions.controller';
import { QuestionsService } from './modules/questions/questions.service';
import { DrizzleSubjectRepository } from './modules/questions/repositories';
import { ExamsController } from './modules/exams/exams.controller';
import { PacksController } from './modules/exams/packs.controller';
import { ExamsService } from './modules/exams/exams.service';
import { ExamBuilderService } from './modules/exams/exam-builder.service';
import { ExamSchedulerService } from './modules/exams/exam-scheduler.service';
import { ExamPackService } from './modules/exams/exam-pack.service';
import { DrizzleExamPackRepository, DrizzleExamRepository } from './modules/exams/repositories';
import { PackStore } from './modules/exams/pack-store';

/**
 * Regression test for the Nest dependency graph when `DATABASE_URL` is set.
 *
 * The users, questions and exams modules only register their controllers and
 * Drizzle repositories when `DATABASE_URL` is present, and they read the
 * variable while their decorators are evaluated (at import time). The value has
 * to be set *before* `AppModule` is imported, which is why this spec uses a
 * dynamic import rather than the static one in `app.e2e.spec.ts`.
 *
 * `postgres()` connects lazily, so a syntactically valid URL is enough to build
 * the graph without a running database.
 */
describe('cloud-api dependency graph with DATABASE_URL (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgres://cbt:cbt@127.0.0.1:5432/cbt';

    const { AppModule } = await import('./app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    delete process.env.DATABASE_URL;
  });

  it('resolves the users module (service, controller and repository)', () => {
    expect(app.get(UsersService)).toBeDefined();
    expect(app.get(UsersController)).toBeDefined();
    expect(app.get(DrizzleStudentRepository)).toBeDefined();
  });

  it('resolves the questions module (service, controller and repository)', () => {
    expect(app.get(QuestionsService)).toBeDefined();
    expect(app.get(QuestionsController)).toBeDefined();
    expect(app.get(DrizzleSubjectRepository)).toBeDefined();
  });

  it('resolves the exams module (services, controllers, repositories and pack store)', () => {
    expect(app.get(ExamsService)).toBeDefined();
    expect(app.get(ExamBuilderService)).toBeDefined();
    expect(app.get(ExamSchedulerService)).toBeDefined();
    expect(app.get(ExamPackService)).toBeDefined();
    expect(app.get(ExamsController)).toBeDefined();
    expect(app.get(PacksController)).toBeDefined();
    expect(app.get(DrizzleExamRepository)).toBeDefined();
    expect(app.get(DrizzleExamPackRepository)).toBeDefined();
    expect(app.get(PackStore)).toBeDefined();
  });
});
