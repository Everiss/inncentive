import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { CollaboratorsService } from './collaborators.service';

@Controller('collaborators')
export class CollaboratorsController {
  constructor(private readonly collaboratorsService: CollaboratorsService) {}

  @Get()
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '15',
    @Query('search') search: string = '',
    @Query('department') department?: string,
    @Query('is_active') is_active?: boolean,
    @Query('companyId') companyId?: string,
  ) {
    return this.collaboratorsService.findAll({
      page: Number(page),
      limit: Number(limit),
      search,
      department,
      is_active,
      companyId: companyId ? Number(companyId) : undefined,
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.collaboratorsService.findById(id);
  }

  @Post()
  async create(@Body() data: any) {
    return this.collaboratorsService.create(data);
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() data: any) {
    return this.collaboratorsService.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.collaboratorsService.delete(id);
  }
}
