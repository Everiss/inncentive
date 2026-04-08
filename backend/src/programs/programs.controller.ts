import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProgramsService } from './programs.service';

@Controller('programs')
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  @Get()
  findByCompany(@Query('companyId', ParseIntPipe) companyId: number) {
    return this.programsService.findByCompany(companyId);
  }

  @Post()
  create(
    @Body()
    body: {
      companyId: number;
      incentiveType: string;
      baseYear: number;
      title?: string;
      notes?: string;
      formdpdFormId?: number;
    },
  ) {
    return this.programsService.create(body);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.programsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      title?: string;
      notes?: string;
      status?: string;
      responsibleContactId?: number | null;
      formdpdFormId?: number | null;
    },
  ) {
    return this.programsService.update(id, body);
  }

  @Patch(':id/stages/:stageType')
  updateStage(
    @Param('id', ParseIntPipe) programId: number,
    @Param('stageType') stageType: string,
    @Body()
    body: {
      status?: string;
      notes?: string;
      dueDate?: string | null;
      assignedContactId?: number | null;
    },
  ) {
    return this.programsService.updateStage(programId, stageType, body);
  }

  @Post(':id/documents')
  addDocument(
    @Param('id', ParseIntPipe) programId: number,
    @Body()
    body: {
      docType: string;
      description?: string;
      referenceYear?: number;
      referencePeriod?: string;
      fileId?: string;
      externalRef?: string;
      notes?: string;
    },
  ) {
    return this.programsService.addDocument(programId, body);
  }

  @Delete(':id/documents/:docId')
  removeDocument(
    @Param('id', ParseIntPipe) programId: number,
    @Param('docId', ParseIntPipe) docId: number,
  ) {
    return this.programsService.removeDocument(programId, docId);
  }

  @Post(':id/rdi-projects/:rdiProjectId')
  linkRdiProject(
    @Param('id', ParseIntPipe) programId: number,
    @Param('rdiProjectId', ParseIntPipe) rdiProjectId: number,
  ) {
    return this.programsService.linkRdiProject(programId, rdiProjectId);
  }

  @Delete(':id/rdi-projects/:rdiProjectId')
  unlinkRdiProject(
    @Param('id', ParseIntPipe) programId: number,
    @Param('rdiProjectId', ParseIntPipe) rdiProjectId: number,
  ) {
    return this.programsService.unlinkRdiProject(programId, rdiProjectId);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.programsService.delete(id);
  }

  // ── Detail sub-resource endpoints ──────────────────────────────────────

  @Get(':id/summary')
  getSummary(@Param('id', ParseIntPipe) id: number) {
    return this.programsService.getSummary(id);
  }

  @Get(':id/projects')
  getLinkedProjects(@Param('id', ParseIntPipe) id: number) {
    return this.programsService.getLinkedProjects(id);
  }

  @Get(':id/collaborators')
  getCollaborators(@Param('id', ParseIntPipe) id: number) {
    return this.programsService.getCollaborators(id);
  }

  @Get(':id/timesheets')
  getTimesheets(
    @Param('id', ParseIntPipe) id: number,
    @Query('year') year?: string,
  ) {
    return this.programsService.getTimesheets(id, year ? Number(year) : undefined);
  }

  @Get(':id/expenses')
  getExpenses(@Param('id', ParseIntPipe) id: number) {
    return this.programsService.getExpenses(id);
  }

  @Get(':id/formpd-expenses')
  getFormpdExpenses(@Param('id', ParseIntPipe) id: number) {
    return this.programsService.getFormpdExpenses(id);
  }

  @Get(':id/formpd-equipment')
  getFormpdEquipment(@Param('id', ParseIntPipe) id: number) {
    return this.programsService.getFormpdEquipment(id);
  }

  @Get(':id/formpd-patents')
  getFormpdPatents(@Param('id', ParseIntPipe) id: number) {
    return this.programsService.getFormpdPatents(id);
  }

  @Get(':id/documents')
  getDocuments(@Param('id', ParseIntPipe) id: number) {
    return this.programsService.getDocuments(id);
  }
}
