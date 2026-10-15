import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.SCHOOL_SERVER_PORT ?? 8080);
  await app.listen(port);
  console.log(`school-server listening on http://localhost:${port}`);
}

void bootstrap();
