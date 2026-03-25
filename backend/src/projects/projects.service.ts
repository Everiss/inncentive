import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreateProjectDto {
  company_id: number;
  owner_contact_id?: number;
  code?: string;
  title: string;
  objective?: string;
  category?: 'PESQUISA_BASICA' | 'PESQUISA_APLICADA' | 'DESENVOLVIMENTO_EXPERIMENTAL' | 'INOVACAO_TECNOLOGICA';
  start_date?: string;
  end_date?: string;
  is_continuous?: boolean;
  project_status?: 'PLANEJAMENTO' | 'EM_EXECUCAO' | 'CONCLUIDO' | 'CANCELADO';
}

export interface UpdateProjectDto {
  owner_contact_id?: number;
  code?: string;
  title?: string;
  objective?: string;
  category?: 'PESQUISA_BASICA' | 'PESQUISA_APLICADA' | 'DESENVOLVIMENTO_EXPERIMENTAL' | 'INOVACAO_TECNOLOGICA';
  eligibility_status?: 'NAO_AVALIADO' | 'ELEGIVEL' | 'PARCIALMENTE_ELEGIVEL' | 'INELEGIVEL';
  eligibility_notes?: string;
  start_date?: string;
  end_date?: string;
  is_continuous?: boolean;
  project_status?: 'PLANEJAMENTO' | 'EM_EXECUCAO' | 'CONCLUIDO' | 'CANCELADO';
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) { }

  /**
   * List RDI projects with optional search and company filter.
   * Includes company, owner and snapshot count per project.
   */
  async findAll(query?: string, companyId?: number) {
    const where: Prisma.rdi_projectsWhereInput = {
      AND: [
        companyId ? { company_id: companyId } : {},
        query
          ? {
            OR: [
              { title: { contains: query } },
              { objective: { contains: query } },
              { code: { contains: query } },
            ],
          }
          : {},
      ],
    };

    return this.prisma.rdi_projects.findMany({
      where,
      include: {
        companies: {
          select: { id: true, legal_name: true, trade_name: true, cnpj: true },
        },
        contacts: {
          select: { id: true, name: true, email: true },
        },
        rdi_project_annual_snapshots: {
          select: {
            id: true,
            base_year: true,
            snapshot_status: true,
            computed_total_eligible: true,
            eligibility_status: true,
          },
          orderBy: { base_year: 'desc' },
        },
        _count: {
          select: {
            rdi_hr_allocations: true,
            rdi_expense_allocations: true,
            rdi_project_documents: true,
          },
        },
      },
      orderBy: [{ project_status: 'asc' }, { created_at: 'desc' }],
    });
  }

  /**
   * Get full project details including all snapshots, allocations and documents.
   */
  async findOne(id: number) {
    const project = await this.prisma.rdi_projects.findUnique({
      where: { id },
      include: {
        companies: {
          select: { id: true, legal_name: true, trade_name: true, cnpj: true },
        },
        contacts: {
          select: { id: true, name: true, email: true },
        },
        rdi_project_annual_snapshots: {
          orderBy: { base_year: 'desc' },
          include: {
            rdi_hr_allocations: {
              select: {
                id: true,
                contact_id: true,
                pct_allocation: true,
                total_eligible_amount: true,
                allocation_method: true,
                is_eligible: true,
              },
            },
            rdi_expense_allocations: {
              select: {
                id: true,
                expense_category: true,
                allocated_amount: true,
                is_eligible: true,
                appropriation_type: true,
              },
            },
          },
        },
        rdi_project_documents: {
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            doc_type: true,
            title: true,
            reference_date: true,
            s3_key: true,
            created_at: true,
          },
        },
        formpd_project_mapping: {
          include: {
            formpd_projects: { select: { id: true, title: true } },
            formpd_forms: { select: { id: true, base_year: true, status: true } },
            rdi_project_annual_snapshots: { select: { id: true, base_year: true } },
          },
        },
      },
    });

    if (!project) throw new NotFoundException(`Projeto #${id} não encontrado`);
    return project;
  }

  /**
   * Create a new RDI project.
   * company_id and title are required.
   */
  async create(data: CreateProjectDto) {
    if (!data.company_id) throw new BadRequestException('company_id é obrigatório');
    if (!data.title?.trim()) throw new BadRequestException('title é obrigatório');

    return this.prisma.rdi_projects.create({
      data: {
        company_id: data.company_id,
        owner_contact_id: data.owner_contact_id ?? null,
        code: data.code ?? null,
        title: data.title.trim(),
        objective: data.objective ?? null,
        category: data.category ?? 'DESENVOLVIMENTO_EXPERIMENTAL',
        start_date: data.start_date ? new Date(data.start_date) : null,
        end_date: data.end_date ? new Date(data.end_date) : null,
        is_continuous: data.is_continuous ?? false,
        project_status: data.project_status ?? 'PLANEJAMENTO',
        eligibility_status: 'NAO_AVALIADO',
      },
      include: {
        companies: {
          select: { id: true, legal_name: true, trade_name: true, cnpj: true },
        },
      },
    });
  }

  /**
   * Update an existing RDI project.
   * Cannot change company_id after creation.
   */
  async update(id: number, data: UpdateProjectDto) {
    await this.findOne(id); // throws 404 if not found

    const updateData: Prisma.rdi_projectsUpdateInput = {};

    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.objective !== undefined) updateData.objective = data.objective;
    if (data.code !== undefined) updateData.code = data.code;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.eligibility_status !== undefined) updateData.eligibility_status = data.eligibility_status;
    if (data.eligibility_notes !== undefined) updateData.eligibility_notes = data.eligibility_notes;
    if (data.project_status !== undefined) updateData.project_status = data.project_status;
    if (data.is_continuous !== undefined) updateData.is_continuous = data.is_continuous;
    if (data.start_date !== undefined) updateData.start_date = data.start_date ? new Date(data.start_date) : null;
    if (data.end_date !== undefined) updateData.end_date = data.end_date ? new Date(data.end_date) : null;
    if (data.owner_contact_id !== undefined) {
      updateData.contacts = data.owner_contact_id
        ? { connect: { id: data.owner_contact_id } }
        : { disconnect: true };
    }

    return this.prisma.rdi_projects.update({
      where: { id },
      data: updateData,
      include: {
        companies: {
          select: { id: true, legal_name: true, trade_name: true, cnpj: true },
        },
      },
    });
  }

  /**
   * Soft-delete: marks project as CANCELADO instead of hard deleting.
   * Hard delete is blocked if there are linked snapshots, allocations or FORMP&D mappings.
   */
  async remove(id: number) {
    const project = await this.prisma.rdi_projects.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            rdi_project_annual_snapshots: true,
            rdi_hr_allocations: true,
            formpd_project_mapping: true,
          },
        },
      },
    });

    if (!project) throw new NotFoundException(`Projeto #${id} não encontrado`);

    const hasLinkedData =
      project._count.rdi_project_annual_snapshots > 0 ||
      project._count.rdi_hr_allocations > 0 ||
      project._count.formpd_project_mapping > 0;

    if (hasLinkedData) {
      // Safe: just mark as cancelled instead of hard delete
      return this.prisma.rdi_projects.update({
        where: { id },
        data: { project_status: 'CANCELADO' },
      });
    }

    return this.prisma.rdi_projects.delete({ where: { id } });
  }

  /**
   * Get or create the annual snapshot for a project/year.
   * Called when closing a fiscal year.
   */
  async getOrCreateSnapshot(projectId: number, baseYear: number) {
    const existing = await this.prisma.rdi_project_annual_snapshots.findFirst({
      where: { project_id: projectId, base_year: baseYear },
    });

    if (existing) return existing;

    return this.prisma.rdi_project_annual_snapshots.create({
      data: {
        project_id: projectId,
        base_year: baseYear,
        snapshot_status: 'ABERTO',
        eligibility_status: 'NAO_AVALIADO',
      },
    });
  }

  /**
   * Close (freeze) a snapshot. After closing, no new allocations can be added.
   * All staging rows must be resolved first.
   */
  async closeSnapshot(snapshotId: number, closedByContactId: number) {
    const snapshot = await this.prisma.rdi_project_annual_snapshots.findUnique({
      where: { id: snapshotId },
    });

    if (!snapshot) throw new NotFoundException(`Snapshot #${snapshotId} não encontrado`);
    if (snapshot.snapshot_status === 'FECHADO') {
      throw new BadRequestException('Snapshot já está fechado');
    }

    // Recalculate totals before closing
    const [rhTotals, expenseTotals] = await Promise.all([
      this.prisma.rdi_hr_allocations.aggregate({
        where: { snapshot_id: snapshotId, is_eligible: true },
        _sum: { total_eligible_amount: true },
      }),
      this.prisma.rdi_expense_allocations.aggregate({
        where: { snapshot_id: snapshotId, is_eligible: true },
        _sum: { allocated_amount: true },
      }),
    ]);

    const rhAmount = Number(rhTotals._sum.total_eligible_amount ?? 0);
    const expAmount = Number(expenseTotals._sum.allocated_amount ?? 0);

    return this.prisma.rdi_project_annual_snapshots.update({
      where: { id: snapshotId },
      data: {
        snapshot_status: 'FECHADO',
        closed_at: new Date(),
        closed_by: closedByContactId,
        computed_rh_amount: rhAmount,
        computed_expense_amount: expAmount,
        computed_total_eligible: rhAmount + expAmount,
      },
    });
  }
}