import { Controller, Get, Post, Query, Body, Param, BadRequestException, NotFoundException } from '@nestjs/common';
import { CompaniesService } from './companies.service';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search: string = '',
    @Query('sortBy') sortBy: string = 'legal_name',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'asc',
  ) {
    return this.companiesService.findAll({
      page: Number(page),
      limit: Number(limit),
      search,
      sortBy,
      sortOrder,
    });
  }

  @Get('stats')
  async getStats() {
    return this.companiesService.getStats();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const company = await this.companiesService.findById(Number(id));
    if (!company) throw new NotFoundException('Empresa não encontrada.');
    return company;
  }

  @Post('check-cnpj')
  async checkCnpj(@Body('cnpj') cnpj: string) {
    if (!cnpj) throw new BadRequestException('CNPJ é obrigatório.');
    return this.companiesService.checkCnpj(cnpj);
  }

  @Post('register-cnpj')
  async registerCnpj(@Body('cnpj') cnpj: string, @Body('forceUpdate') forceUpdate: boolean = false) {
    if (!cnpj) throw new BadRequestException('CNPJ é obrigatório.');
    return this.companiesService.registerByCnpj(cnpj, forceUpdate);
  }
}
