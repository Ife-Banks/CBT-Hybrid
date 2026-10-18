import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import request from 'supertest';
import { AppModule } from './app.module';
import { problemRateLimitHandler } from './common/http/rate-limit.handler';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

/**
 * End-to-end tests for the cloud-api foundation: health, correlation ids,
 * problem+json errors and rate limiting. Uses SWC (see vitest.config.ts) so
 * Nest's decorator metadata is available.
 */
describe('cloud-api foundation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Keep tests hermetic: no ambient DATABASE_URL/REDIS_URL from the machine.
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware());
    app.use(helmet());
    app.use(
      rateLimit({
        windowMs: 60_000,
        limit: 100,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: problemRateLimitHandler(),
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns the expected envelope', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('cloud-api');
    expect(typeof res.body.version).toBe('string');
    expect(typeof res.body.uptime).toBe('string');
    expect(res.body.services).toHaveProperty('database');
    expect(res.body.services).toHaveProperty('redis');
    expect(res.body.services.memory.status).toBe('ok');
  });

  it('reports correlation ids on every response', async () => {
    const first = await request(app.getHttpServer()).get('/health').expect(200);
    expect(first.headers['x-request-id']).toBeTruthy();

    const inbound = 'test-inbound-request-id';
    const second = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', inbound)
      .expect(200);
    expect(second.headers['x-request-id']).toBe(inbound);
  });

  it('returns problem+json for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist').expect(404);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.status).toBe(404);
    expect(res.body.title).toBeTruthy();
    expect(res.body.request_id).toBeTruthy();
  });

  it('sets security headers from helmet', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('generates an OpenAPI document covering the cloud routes', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('CBT Cloud API').setVersion('0').build(),
    );

    expect(document.paths['/health']).toBeDefined();
    expect(document.paths['/auth/login']).toBeDefined();
    expect(document.paths['/imports']).toBeDefined();
    expect(document.paths['/students/{id}/data-export']).toBeDefined();
    expect(document.paths['/imports/templates/{file}']).toBeDefined();
  });

  // Keep this last: it deliberately exhausts the limiter for this test app.
  it('rate limits and returns problem+json after the configured maximum', async () => {
    let limited: { status: number; contentType: string; body: Record<string, unknown> } | undefined;

    for (let i = 0; i < 160; i += 1) {
      const res = await request(app.getHttpServer()).get('/health');
      if (res.status === 429) {
        limited = {
          status: res.status,
          contentType: String(res.headers['content-type'] ?? ''),
          body: res.body as Record<string, unknown>,
        };
        break;
      }
    }

    expect(limited).toBeDefined();
    expect(limited?.contentType).toContain('application/problem+json');
    expect(limited?.body.code).toBe('RATE_LIMITED');
    expect(limited?.status).toBe(429);
  });
});
