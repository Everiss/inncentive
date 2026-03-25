import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FormpdService {
  private readonly logger = new Logger(FormpdService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * List all FORMP&D forms for a specific company.
   */
  async findFormsByCompany(companyId: number) {
    return this.prisma.formpd_forms.findMany({
      where: { company_id: companyId },
      orderBy: { base_year: 'desc' },
      include: {
        formpd_fiscal_incentives: true,
        formpd_form_representatives: {
          include: { contacts: true },
        },
      },
    });
  }

  /**
   * Create a new FORMP&D form for a company and year.
   */
  async createForm(data: { companyId: number; baseYear: number }) {
    return this.prisma.formpd_forms.create({
      data: {
        company_id: data.companyId,
        base_year: data.baseYear,
        status: 'NAO_PREENCHIDO',
      },
    });
  }

  /**
   * Get full details of a FORMP&D form, including projects.
   */
  async getFormDetails(id: number) {
    return this.prisma.formpd_forms.findUnique({
      where: { id },
      include: {
        formpd_projects: {
          include: {
            formpd_project_human_resources: true,
            formpd_project_expenses: true,
            formpd_project_equipment: true,
          },
        },
        formpd_fiscal_incentives: true,
        formpd_form_representatives: {
          include: { contacts: true },
        },
      },
    });
  }

  /**
   * Add a project to a FORMP&D form.
   */
  async addProject(formId: number, data: { title: string; description: string; techAreaCode?: string }) {
    return this.prisma.formpd_projects.create({
      data: {
        form_id: formId,
        title: data.title,
        description: data.description,
        tech_area_code: data.techAreaCode,
      },
    });
  }

  /**
   * Map an internal RDI project snapshot to a FORMP&D project.
   * This implements the N:1 mapping mentioned in the specs (6.1).
   */
  async mapRdiToFormPd(params: {
    formId: number;
    formPdProjectId: number;
    rdiProjectId: number;
    snapshotId: number;
    hrAmount?: number;
    expenseAmount?: number;
  }) {
    return this.prisma.formpd_project_mapping.create({
      data: {
        formpd_form_id: params.formId,
        formpd_project_id: params.formPdProjectId,
        rdi_project_id: params.rdiProjectId,
        snapshot_id: params.snapshotId,
        hr_amount_mapped: params.hrAmount,
        expense_amount_mapped: params.expenseAmount,
      },
    });
  }
}
