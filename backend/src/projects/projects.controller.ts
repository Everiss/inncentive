import {
  Controller, Get, Post, Body, Put, Param, Delete,
  Query, ParseIntPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ProjectsService, CreateProjectDto, UpdateProjectDto } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) { }

  /**
   * GET /projects
   * List RDI projects. Supports ?query= and ?companyId= filters.
   */
  @Get()
  async findAll(
    @Query('query') query?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.projectsService.findAll(query, companyId ? Number(companyId) : undefined);
  }

  /**
   * GET /projects/:id
   * Full project details with snapshots, allocations and FORMP&D mappings.
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findOne(id);
  }

  /**
   * POST /projects
   * Create a new RDI project.
   * Required: company_id, title
   * Optional: code, objective, category, start_date, end_date, is_continuous, owner_contact_id
   */
  @Post()
  async create(@Body() data: CreateProjectDto) {
    return this.projectsService.create(data);
  }

  /**
   * PUT /projects/:id
   * Update project fields. company_id cannot be changed.
   */
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateProjectDto,
  ) {
    return this.projectsService.update(id, data);
  }

  /**
   * DELETE /projects/:id
   * Soft delete: marks project as CANCELADO if it has linked data.
   * Hard deletes only if no snapshots, allocations or FORMP&D mappings exist.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.remove(id);
  }

  /**
   * POST /projects/:id/snapshots
   * Get or create the annual snapshot for a project.
   * Body: { base_year: number }
   */
  @Post(':id/snapshots')
  async getOrCreateSnapshot(
    @Param('id', ParseIntPipe) id: number,
    @Body('base_year', ParseIntPipe) baseYear: number,
  ) {
    return this.projectsService.getOrCreateSnapshot(id, baseYear);
  }

  /**
   * POST /projects/snapshots/:snapshotId/close
   * Freeze (close) a snapshot. Calculates and persists final totals.
   * Body: { closed_by: number } (contact_id of the user closing)
   */
  @Post('snapshots/:snapshotId/close')
  async closeSnapshot(
    @Param('snapshotId', ParseIntPipe) snapshotId: number,
    @Body('closed_by', ParseIntPipe) closedBy: number,
  ) {
    return this.projectsService.closeSnapshot(snapshotId, closedBy);
  }
}