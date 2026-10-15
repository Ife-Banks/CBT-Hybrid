import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
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

  app.enableShutdownHooks();

  const port = config.port;
  await app.listen(port);
  logger.log(`cloud-api listening on ${config.publicUrl} (port ${port})`, 'Bootstrap');
}

void bootstrap();
