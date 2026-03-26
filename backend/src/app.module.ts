import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CompaniesModule } from './companies/companies.module';
import { ConfigModule } from '@nestjs/config';
import { ImportsModule } from './imports/imports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ContactsModule } from './contacts/contacts.module';
import { CollaboratorsModule } from './collaborators/collaborators.module';
import { BullModule } from '@nestjs/bullmq';
import { ProjectsModule } from './projects/projects.module';
import { FormpdModule } from './formpd/formpd.module';
import { IaModule } from './ia/ia.module';
import { QueueAdminModule } from './queue-admin/queue-admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: 'localhost',
        port: 6379,
      },
    }),
    PrismaModule,
    CompaniesModule,
    ImportsModule,
    NotificationsModule,
    ContactsModule,
    CollaboratorsModule,
    ProjectsModule,
    FormpdModule,
    IaModule,
    QueueAdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
