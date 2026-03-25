import { Module } from '@nestjs/common';
import { FormpdService } from './formpd.service';
import { FormpdController } from './formpd.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [FormpdService],
  controllers: [FormpdController],
  exports: [FormpdService],
})
export class FormpdModule {}
