import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CompaniesModule } from './companies/companies.module';
import { ConfigModule } from '@nestjs/config';
import { ContactsModule } from './contacts/contacts.module';
import { CollaboratorsModule } from './collaborators/collaborators.module';
import { BullModule } from '@nestjs/bullmq';
import { ProjectsModule } from './projects/projects.module';
import { FormpdModule } from './formpd/formpd.module';
import { ImportsModule } from './imports/imports.module';

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
    ContactsModule,
    CollaboratorsModule,
    ProjectsModule,
    FormpdModule,
    ImportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
