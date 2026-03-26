import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { ContactsModule } from '../contacts/contacts.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [ContactsModule, IntegrationsModule],
  controllers: [CompaniesController],
  providers: [CompaniesService]
})
export class CompaniesModule {}
