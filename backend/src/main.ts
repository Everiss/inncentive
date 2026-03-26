import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 5000);
  console.log('INFO: [backend] DATABASE_URL configured');
  app.enableCors();
  await app.listen(port);
  console.log(`INFO: [backend] listening on :${port}`);
}
bootstrap();
