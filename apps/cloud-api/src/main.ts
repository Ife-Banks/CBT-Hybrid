import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { VERSION } from '@cbt/shared-types';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { AppModule } from './app.module';
import { ConfigService } from './common/config/config.service';
import { problemRateLimitHandler } from './common/http/rate-limit.handler';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { LoggerService } from './shared/logger/logger.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  const config = app.get(ConfigService);
  const logger = app.get(LoggerService);
  app.useLogger(logger);

  // Cloud routes live under `/api/v1` (API spec section 1.1); `/health` stays at
  // the root so infrastructure probes do not need the version prefix.
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  // Security and middleware (Phase 1 task 1).
  app.use(requestIdMiddleware());
  app.use(helmet());
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.useBodyParser('json', { limit: config.get('BODY_LIMIT') });
  app.useBodyParser('urlencoded', { limit: config.get('BODY_LIMIT'), extended: true });
  app.use(
    rateLimit({
      windowMs: config.get('RATE_LIMIT_WINDOW_MS'),
      limit: config.get('RATE_LIMIT_MAX'),
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: problemRateLimitHandler(),
    }),
  );

  // Stricter sign-in limit (API spec section 1.7: 10 per minute per IP). The
  // per-account lockout is enforced in AuthService.
  app.use(
    '/api/v1/auth/login',
    rateLimit({
      windowMs: config.auth.loginRateLimitWindowMs,
      limit: config.auth.loginRateLimitMax,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: problemRateLimitHandler(),
    }),
  );

  app.enableShutdownHooks();

  // OpenAPI documentation (Swagger UI at `/docs`, JSON at `/docs-json`). Not
  // affected by the `/api/v1` global prefix, so probes and docs share the root.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CBT Cloud API')
    .setDescription('Cloud REST and Sync API. All routes live under `/api/v1`.')
    .setVersion(VERSION)
    .addBearerAuth()
    .addTag('Auth')
    .addTag('Users')
    .addTag('Questions')
    .addTag('Exams')
    .addTag('Results')
    .addTag('Analytics')
    .addTag('Notifications')
    .addTag('Settings')
    .addTag('Sync')
    .addTag('Imports')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.port;
  await app.listen(port);
  logger.log(`cloud-api listening on ${config.publicUrl} (port ${port})`, 'Bootstrap');
}

void bootstrap();
