import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  console.log('DATABASE_URL:', process.env.DATABASE_URL);
  app.enableCors();
  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();
