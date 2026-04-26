import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [
      companiesTotal,
      companiesActive,
      companiesNewThisMonth,
      contactsTotal,
      collaboratorsTotal,
      projectsTotal,
      projectsByStatus,
      programsTotal,
      programsByStatus,
      programsByType,
      formsTotal,
      formsByStatus,
      recentBatches,
      recentCompanies,
    ] = await Promise.all([
      this.prisma.companies.count(),
      this.prisma.companies.count({ where: { situation: 'ATIVA' } }),
      this.prisma.companies.count({ where: { created_at: { gte: startOfMonth } } }),
      this.prisma.contacts.count(),
      this.prisma.collaborators.count({ where: { is_active: true } }),
      this.prisma.rdi_projects.count(),
      this.prisma.rdi_projects.groupBy({
        by: ['project_status'],
        _count: { id: true },
      }),
      this.prisma.programs.count(),
      this.prisma.programs.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.programs.groupBy({
        by: ['incentive_type'],
        _count: { id: true },
      }),
      this.prisma.formpd_forms.count(),
      this.prisma.formpd_forms.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.import_batches.findMany({
        take: 8,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          entity_type: true,
          file_name: true,
          status: true,
          total_records: true,
          success_count: true,
          error_count: true,
          created_at: true,
          company: { select: { legal_name: true } },
        },
      }),
      this.prisma.companies.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        where: { created_at: { gte: startOfYear } },
        select: {
          id: true,
          legal_name: true,
          trade_name: true,
          cnpj: true,
          situation: true,
          created_at: true,
        },
      }),
    ]);

    const projectsStatusMap = Object.fromEntries(
      projectsByStatus.map((r) => [r.project_status, r._count.id]),
    );
    const programsStatusMap = Object.fromEntries(
      programsByStatus.map((r) => [r.status, r._count.id]),
    );
    const programsTypeMap = Object.fromEntries(
      programsByType.map((r) => [r.incentive_type, r._count.id]),
    );
    const formsStatusMap = Object.fromEntries(
      formsByStatus.map((r) => [r.status, r._count.id]),
    );

    return {
      companies: {
        total: companiesTotal,
        active: companiesActive,
        newThisMonth: companiesNewThisMonth,
      },
      contacts: { total: contactsTotal },
      collaborators: { total: collaboratorsTotal },
      projects: {
        total: projectsTotal,
        byStatus: {
          PLANEJAMENTO: projectsStatusMap['PLANEJAMENTO'] ?? 0,
          EM_EXECUCAO: projectsStatusMap['EM_EXECUCAO'] ?? 0,
          CONCLUIDO: projectsStatusMap['CONCLUIDO'] ?? 0,
          CANCELADO: projectsStatusMap['CANCELADO'] ?? 0,
        },
      },
      programs: {
        total: programsTotal,
        byStatus: {
          RASCUNHO: programsStatusMap['RASCUNHO'] ?? 0,
          EM_ANDAMENTO: programsStatusMap['EM_ANDAMENTO'] ?? 0,
          EM_REVISAO: programsStatusMap['EM_REVISAO'] ?? 0,
          FINALIZADO: programsStatusMap['FINALIZADO'] ?? 0,
          SUBMETIDO: programsStatusMap['SUBMETIDO'] ?? 0,
        },
        byType: {
          LEI_DO_BEM: programsTypeMap['LEI_DO_BEM'] ?? 0,
          LEI_DA_INFORMATICA: programsTypeMap['LEI_DA_INFORMATICA'] ?? 0,
          ROTA_2030: programsTypeMap['ROTA_2030'] ?? 0,
        },
      },
      forms: {
        total: formsTotal,
        byStatus: {
          NAO_PREENCHIDO: formsStatusMap['NAO_PREENCHIDO'] ?? 0,
          EM_PREENCHIMENTO: formsStatusMap['EM_PREENCHIMENTO'] ?? 0,
          FINALIZADO: formsStatusMap['FINALIZADO'] ?? 0,
          SUBMETIDO: formsStatusMap['SUBMETIDO'] ?? 0,
        },
      },
      recentBatches: recentBatches.map((b) => ({ ...b, companies: b.company })),
      recentCompanies,
    };
  }
}
