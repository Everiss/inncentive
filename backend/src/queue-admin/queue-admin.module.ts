import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueAdminController } from './queue-admin.controller';
import { QueueAdminService } from './queue-admin.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      { name: 'import-cnpjs' },
      { name: 'formpd-extraction' },
    ),
  ],
  controllers: [QueueAdminController],
  providers: [QueueAdminService],
  exports: [QueueAdminService],
})
export class QueueAdminModule {}

