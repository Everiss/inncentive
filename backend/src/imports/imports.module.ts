import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { QueueAdminController } from './queue-admin.controller';
import { QueueAdminService } from './queue-admin.service';

@Module({
  imports: [
    IntegrationsModule,
    PrismaModule,
    BullModule.registerQueue(
      { name: 'import-cnpjs' },
      { name: 'formpd-extraction' },
    ),
  ],
  controllers: [ImportsController, QueueAdminController],
  providers: [ImportsService, QueueAdminService],
})
export class ImportsModule {}
