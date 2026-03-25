import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ImportsProcessor } from './imports.processor';
import { FormpdExtractionProcessor } from './formpd-extraction.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigService } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContactsModule } from '../contacts/contacts.module';
import { CollaboratorsModule } from '../collaborators/collaborators.module';
import { ProjectsModule } from '../projects/projects.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    HttpModule,
    PrismaModule,
    NotificationsModule,
    ContactsModule,
    CollaboratorsModule,
    ProjectsModule,
    BullModule.registerQueue({
      name: 'import-cnpjs',
    }),
    BullModule.registerQueue({
      name: 'formpd-extraction',
    }),
  ],
  controllers: [ImportsController],
  providers: [
    ImportsService, 
    ImportsProcessor, 
    FormpdExtractionProcessor,
    ConfigService
  ],
  exports: [ImportsService],
})
export class ImportsModule {}
