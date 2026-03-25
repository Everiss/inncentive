import { Controller, Get, Query, Param, ParseIntPipe } from '@nestjs/common';
import { ContactsService } from './contacts.service';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '15',
    @Query('search') search: string = '',
    @Query('role') role: string = '',
    @Query('sortBy') sortBy: string = 'name',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'asc',
    @Query('companyId') companyId?: string,
  ) {
    return this.contactsService.findAll({
      page: Number(page),
      limit: Number(limit),
      search,
      role,
      sortBy,
      sortOrder,
      companyId: companyId ? Number(companyId) : undefined,
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contactsService.findById(id);
  }
}
