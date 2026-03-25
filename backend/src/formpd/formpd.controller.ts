import { Controller, Get, Post, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { FormpdService } from './formpd.service';

@Controller('formpd')
export class FormpdController {
  constructor(private readonly formpdService: FormpdService) {}

  /** Global list — all forms across all companies */
  @Get('all')
  async findAll() {
    return this.formpdService.findAllForms();
  }

  @Get()
  async findByCompany(@Query('companyId', ParseIntPipe) companyId: number) {
    return this.formpdService.findFormsByCompany(companyId);
  }

  @Post()
  async create(@Body() body: { companyId: number; baseYear: number }) {
    return this.formpdService.createForm(body);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.formpdService.getFormDetails(id);
  }

  @Post(':id/projects')
  async addProject(
    @Param('id', ParseIntPipe) formId: number,
    @Body() body: { title: string; description: string; techAreaCode?: string },
  ) {
    return this.formpdService.addProject(formId, body);
  }

  @Post('map-project')
  async mapProject(
    @Body() body: {
      formId: number;
      formPdProjectId: number;
      rdiProjectId: number;
      snapshotId: number;
      hrAmount?: number;
      expenseAmount?: number;
    },
  ) {
    return this.formpdService.mapRdiToFormPd(body);
  }
}
