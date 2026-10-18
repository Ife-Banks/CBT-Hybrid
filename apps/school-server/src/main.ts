import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { SchoolConfigService } from './common/config/school-config.service';
import { LoggerService } from './shared/logger/logger.service';
import { resolveExamClientDir, resolveWebDir } from './modules/setup/web-pages';
import { VERSION } from '@cbt/shared-types';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  const config = app.get(SchoolConfigService);
  const logger = app.get(LoggerService);
  app.useLogger(logger);

  // Swagger/OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CBT School Server API')
    .setDescription('School-server exam delivery and sync API')
    .setVersion(VERSION)
    .addTag('health', 'Health check endpoints')
    .addTag('exam', 'Exam delivery endpoints')
    .addTag('admin', 'Admin endpoints')
    .addTag('setup', 'First-run setup endpoints')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  // Static bundles: the exam client at the root (the lab shortcut points at
  // `http://<server>/?seat=<PC>`), and the setup page's CSS/JS under `/static`.
  const clientDir = resolveExamClientDir();
  if (clientDir) {
    app.useStaticAssets(clientDir, { prefix: '/' });
  }
  const webDir = resolveWebDir();
  if (webDir) {
    app.useStaticAssets(webDir, { prefix: '/static/' });
  }

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
