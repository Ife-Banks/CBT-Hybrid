import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { SchoolConfigService } from './common/config/school-config.service';
import { LoggerService } from './shared/logger/logger.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  const config = app.get(SchoolConfigService);
  const logger = app.get(LoggerService);
  app.useLogger(logger);

  app.use(helmet());
  app.enableCors({ origin: true, credentials: true });
  app.useBodyParser('json', { limit: config.get('BODY_LIMIT') });
  app.useBodyParser('urlencoded', { limit: config.get('BODY_LIMIT'), extended: true });

  app.enableShutdownHooks();

  const port = config.port;
  await app.listen(port);
  logger.log(`school-server listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
