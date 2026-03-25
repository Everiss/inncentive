import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [HttpModule, ContactsModule],
  controllers: [CompaniesController],
  providers: [CompaniesService]
})
export class CompaniesModule {}
