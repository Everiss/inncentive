import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const INCENTIVE_ABBREV: Record<string, string> = {
  LEI_DO_BEM:       'LDB',
  LEI_DA_INFORMATICA: 'LDI',
  ROTA_2030:        'R2030',
};

function buildProgramTitle(
  incentiveType: string,
  baseYear: number,
  companyName: string,
): string {
  const abbrev = INCENTIVE_ABBREV[incentiveType] ?? incentiveType;
  const normalized = companyName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')     // keep only letters, digits, spaces
    .trim()
    .replace(/\s+/g, '_');           // spaces → underscore
  return `${abbrev}_${baseYear}_${normalized}`;
}

const STAGE_DEFAULTS: Array<{ type: string; title: string; sort_order: number }> = [
  { type: 'COLETA_DADOS',          title: 'Coleta de Dados Técnicos e Econômicos', sort_order: 0 },
  { type: 'ANALISE_ELEGIBILIDADE', title: 'Análise e Elegibilidade',               sort_order: 1 },
  { type: 'DEFINICAO_ESTRATEGIA',  title: 'Definição de Estratégia',               sort_order: 2 },
  { type: 'CALCULO_AGRUPAMENTO',   title: 'Cálculo e Agrupamento de Informações',  sort_order: 3 },
  { type: 'ENTREGAVEIS_INICIAIS',  title: 'Entregáveis Iniciais (Balancete / Relatórios)', sort_order: 4 },
  { type: 'AUDITORIA_VALIDACAO',   title: 'Auditoria e Validação da Escrita Técnica', sort_order: 5 },
  { type: 'EVIDENCIAS_FISCAIS',    title: 'Evidências Fiscais (ECF, ECD, DIRBI)',  sort_order: 6 },
  { type: 'ELABORACAO_OBRIGACAO',  title: 'Elaboração da Obrigação (FORMp&D / etc.)', sort_order: 7 },
];

@Injectable()
export class ProgramsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCompany(companyId: number) {
    return this.prisma.programs.findMany({
      where: { company_id: companyId },
      include: {
        stages: { orderBy: { sort_order: 'asc' } },
        _count: { select: { documents: true, rdi_projects: true } },
      },
      orderBy: [{ base_year: 'desc' }, { incentive_type: 'asc' }],
    });
  }

  async findOne(id: number) {
    const program = await this.prisma.programs.findUnique({
      where: { id },
      include: {
        stages: {
          orderBy: { sort_order: 'asc' },
          include: { contacts: { select: { id: true, name: true } } },
        },
        documents: { orderBy: { created_at: 'desc' } },
        rdi_projects: {
          include: {
            rdi_projects: { select: { id: true, code: true, title: true, project_status: true } },
          },
        },
        contacts: { select: { id: true, name: true } },
        formpd_forms: { select: { id: true, base_year: true, status: true } },
        companies: { select: { id: true, cnpj: true, legal_name: true } },
      },
    });
    if (!program) throw new NotFoundException(`Program ${id} not found`);
    return program;
  }

  async create(body: {
    companyId: number;
    incentiveType: string;
    baseYear: number;
    notes?: string;
    formdpdFormId?: number;
  }) {
    const company = await this.prisma.companies.findUniqueOrThrow({
      where: { id: body.companyId },
      select: { legal_name: true },
    });

    const title = buildProgramTitle(body.incentiveType, body.baseYear, company.legal_name);

    const program = await this.prisma.programs.create({
      data: {
        company_id: body.companyId,
        incentive_type: body.incentiveType as any,
        base_year: body.baseYear,
        title,
        notes: body.notes,
        formpd_form_id: body.formdpdFormId ?? null,
        stages: {
          create: STAGE_DEFAULTS.map((s) => ({
            stage_type: s.type as any,
            title: s.title,
            sort_order: s.sort_order,
          })),
        },
      },
      include: {
        stages: { orderBy: { sort_order: 'asc' } },
      },
    });
    return program;
  }

  async update(
    id: number,
    body: {
      title?: string;
      notes?: string;
      status?: string;
      responsibleContactId?: number | null;
      formdpdFormId?: number | null;
    },
  ) {
    return this.prisma.programs.update({
      where: { id },
      data: {
        title: body.title,
        notes: body.notes,
        status: body.status as any,
        responsible_contact_id: body.responsibleContactId,
        formpd_form_id: body.formdpdFormId,
      },
    });
  }

  async updateStage(
    programId: number,
    stageType: string,
    body: {
      status?: string;
      notes?: string;
      dueDate?: string | null;
      assignedContactId?: number | null;
    },
  ) {
    return this.prisma.program_stages.updateMany({
      where: { program_id: programId, stage_type: stageType as any },
      data: {
        status: body.status as any,
        notes: body.notes,
        due_date: body.dueDate ? new Date(body.dueDate) : undefined,
        assigned_contact_id: body.assignedContactId,
        completed_at: body.status === 'CONCLUIDO' ? new Date() : body.status ? null : undefined,
      },
    });
  }

  async addDocument(
    programId: number,
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
    return this.prisma.program_documents.create({
      data: {
        program_id: programId,
        doc_type: body.docType as any,
        description: body.description,
        reference_year: body.referenceYear,
        reference_period: body.referencePeriod,
        file_id: body.fileId,
        external_ref: body.externalRef,
        notes: body.notes,
      },
    });
  }

  async removeDocument(programId: number, docId: number) {
    await this.prisma.program_documents.deleteMany({
      where: { id: docId, program_id: programId },
    });
  }

  async linkRdiProject(programId: number, rdiProjectId: number) {
    return this.prisma.program_rdi_projects.upsert({
      where: { program_id_rdi_project_id: { program_id: programId, rdi_project_id: rdiProjectId } },
      create: { program_id: programId, rdi_project_id: rdiProjectId },
      update: {},
    });
  }

  async unlinkRdiProject(programId: number, rdiProjectId: number) {
    await this.prisma.program_rdi_projects.deleteMany({
      where: { program_id: programId, rdi_project_id: rdiProjectId },
    });
  }

  async delete(id: number) {
    await this.prisma.programs.delete({ where: { id } });
  }

  // ── Detail sub-resources ────────────────────────────────────────────────

  async getSummary(programId: number) {
    const program = await this.prisma.programs.findUniqueOrThrow({
      where: { id: programId },
      include: {
        stages: true,
        _count: { select: { documents: true, rdi_projects: true } },
        companies: { select: { id: true, cnpj: true, legal_name: true, trade_name: true } },
        contacts: { select: { id: true, name: true } },
        formpd_forms: { select: { id: true, base_year: true, status: true, submission_status: true } },
      },
    });

    const projectIds = (
      await this.prisma.program_rdi_projects.findMany({
        where: { program_id: programId },
        select: { rdi_project_id: true },
      })
    ).map((r) => r.rdi_project_id);

    const collaboratorCount =
      projectIds.length > 0
        ? await this.prisma.rdi_hr_allocations.groupBy({
            by: ['contact_id'],
            where: { project_id: { in: projectIds } },
          }).then((r) => r.length)
        : 0;

    const expenseCount =
      projectIds.length > 0
        ? await this.prisma.rdi_expense_allocations.count({
            where: { project_id: { in: projectIds } },
          })
        : 0;

    const completedStages = program.stages.filter((s) => s.status === 'CONCLUIDO').length;
    const totalStages = program.stages.filter((s) => s.status !== 'NAO_APLICAVEL').length;

    return {
      ...program,
      stats: {
        projects: program._count.rdi_projects,
        documents: program._count.documents,
        collaborators: collaboratorCount,
        expenses: expenseCount,
        completedStages,
        totalStages,
        progressPct: totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0,
      },
    };
  }

  async getLinkedProjects(programId: number) {
    const links = await this.prisma.program_rdi_projects.findMany({
      where: { program_id: programId },
      include: {
        rdi_projects: {
          include: {
            contacts: { select: { id: true, name: true } },
            _count: {
              select: {
                rdi_hr_allocations: true,
                rdi_expense_allocations: true,
                rdi_project_documents: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });
    return links.map((l) => l.rdi_projects);
  }

  async getCollaborators(programId: number) {
    const projectIds = (
      await this.prisma.program_rdi_projects.findMany({
        where: { program_id: programId },
        select: { rdi_project_id: true },
      })
    ).map((r) => r.rdi_project_id);

    if (projectIds.length === 0) return [];

    const allocations = await this.prisma.rdi_hr_allocations.findMany({
      where: { project_id: { in: projectIds } },
      include: {
        contacts_rdi_hr_allocations_contact_idTocontacts: {
          select: {
            id: true,
            name: true,
            email: true,
            collaborator: {
              select: {
                id: true,
                position: true,
                department: true,
                registration_number: true,
                is_active: true,
                employment_type: true,
                academic_degree: true,
                is_researcher: true,
              },
            },
          },
        },
        rdi_projects: { select: { id: true, title: true, code: true } },
      },
      orderBy: [{ project_id: 'asc' }, { contact_id: 'asc' }],
    });

    // Deduplicate by contact_id, merge project list
    const byContact = new Map<number, any>();
    for (const alloc of allocations) {
      const contact = alloc.contacts_rdi_hr_allocations_contact_idTocontacts;
      if (!contact) continue;
      if (!byContact.has(contact.id)) {
        byContact.set(contact.id, {
          contact,
          projects: [],
          totalAllocations: 0,
        });
      }
      const entry = byContact.get(contact.id)!;
      entry.totalAllocations++;
      if (!entry.projects.find((p: any) => p.id === alloc.rdi_projects.id)) {
        entry.projects.push(alloc.rdi_projects);
      }
    }
    return Array.from(byContact.values());
  }

  async getTimesheets(programId: number, year?: number) {
    const projectIds = (
      await this.prisma.program_rdi_projects.findMany({
        where: { program_id: programId },
        select: { rdi_project_id: true },
      })
    ).map((r) => r.rdi_project_id);

    if (projectIds.length === 0) return [];

    return this.prisma.rdi_timesheet_entries.findMany({
      where: {
        project_id: { in: projectIds },
        ...(year
          ? {
              entry_date: {
                gte: new Date(`${year}-01-01`),
                lte: new Date(`${year}-12-31`),
              },
            }
          : {}),
      },
      include: {
        contacts: { select: { id: true, name: true } },
        rdi_projects: { select: { id: true, title: true, code: true } },
      },
      orderBy: [{ entry_date: 'desc' }],
      take: 500,
    });
  }

  async getExpenses(programId: number) {
    const projectIds = (
      await this.prisma.program_rdi_projects.findMany({
        where: { program_id: programId },
        select: { rdi_project_id: true },
      })
    ).map((r) => r.rdi_project_id);

    if (projectIds.length === 0) return [];

    return this.prisma.rdi_expense_allocations.findMany({
      where: { project_id: { in: projectIds } },
      include: {
        rdi_expense_documents: {
          include: {
            contacts: { select: { id: true, name: true } },
          },
        },
        rdi_projects: { select: { id: true, title: true, code: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 500,
    });
  }

  async getFormpdExpenses(programId: number) {
    const program = await this.prisma.programs.findUnique({
      where: { id: programId },
      select: { formpd_form_id: true },
    });
    if (!program?.formpd_form_id) return [];

    return this.prisma.formpd_project_expenses.findMany({
      where: { formpd_projects: { form_id: program.formpd_form_id } },
      include: {
        formpd_projects: { select: { id: true, title: true, item_number: true } },
      },
      orderBy: [{ formpd_projects: { item_number: 'asc' } }, { expense_category: 'asc' }],
    });
  }

  async getFormpdEquipment(programId: number) {
    const program = await this.prisma.programs.findUnique({
      where: { id: programId },
      select: { formpd_form_id: true },
    });
    if (!program?.formpd_form_id) return [];

    return this.prisma.formpd_project_equipment.findMany({
      where: { formpd_projects: { form_id: program.formpd_form_id } },
      include: {
        formpd_projects: { select: { id: true, title: true, item_number: true } },
      },
      orderBy: [{ formpd_projects: { item_number: 'asc' } }],
    });
  }

  async getFormpdPatents(programId: number) {
    const program = await this.prisma.programs.findUnique({
      where: { id: programId },
      select: { formpd_form_id: true },
    });
    if (!program?.formpd_form_id) return [];

    return this.prisma.formpd_project_patents.findMany({
      where: { formpd_projects: { form_id: program.formpd_form_id } },
      include: {
        formpd_projects: { select: { id: true, title: true, item_number: true } },
      },
      orderBy: [{ formpd_projects: { item_number: 'asc' } }],
    });
  }

  async getDocuments(programId: number) {
    return this.prisma.program_documents.findMany({
      where: { program_id: programId },
      orderBy: [{ doc_type: 'asc' }, { reference_year: 'desc' }],
    });
  }
}
