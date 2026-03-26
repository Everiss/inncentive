import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ContactsService } from '../contacts/contacts.service';
import { CollaboratorsService } from '../collaborators/collaborators.service';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { parseReceitaWSPhones } from '../common/phone-parser.util';
import { ProjectsService } from '../projects/projects.service';
import * as fs from 'fs';
import { FileHubService } from '../file-hub/file-hub.service';

@Processor('import-cnpjs', {
  concurrency: 1, 
})
export class ImportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportsProcessor.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly contactsService: ContactsService,
    private readonly collaboratorsService: CollaboratorsService,
    private readonly projectsService: ProjectsService,
    private readonly configService: ConfigService,
    private readonly fileHubService: FileHubService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { itemId, batchId, fileId, intakeId, fileJobId } = job.data;
    let isSuccess = false;
    let errorMsg: string | null = null;

    // 1. Initial Batch Update
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (batch?.status === 'PENDING') {
      await this.prisma.import_batches.update({ where: { id: batchId }, data: { status: 'PROCESSING' } });
      if (fileId && fileJobId) {
        await this.fileHubService.markJobStarted(fileId, fileJobId, intakeId ?? null);
      }
    }

    try {
      switch (job.name) {
        case 'process-cnpj':
          isSuccess = await this.importAndSaveCompany(job.data.cnpj);
          if (!isSuccess) errorMsg = 'Falha na ReceitaWS ou ao Salvar.';

          // If this CNPJ job was triggered to satisfy a COMPANY_NOT_FOUND FORMPD batch,
          // link back to that batch once the company is saved.
          if (isSuccess && job.data.formpd_batch_id) {
            await this.linkFormpdBatch(job.data.cnpj, job.data.formpd_batch_id);
          }

          // Delay inteligente baseado no plano
          const token = this.configService.get<string>('RECEITA_WS_TOKEN');
          const delay = token ? 3200 : 20500; // 3.2s para plano de 20req/min, 20.5s para free
          await new Promise(resolve => setTimeout(resolve, delay));
          break;

        case 'process-contact':
          isSuccess = await this.processContactRow(job.data.payload, job.data.companyId);
          if (!isSuccess) errorMsg = 'Falha ao processar dados do contato.';
          break;

        case 'process-collaborator':
          isSuccess = await this.processCollaboratorRow(job.data.payload, job.data.companyId);
          if (!isSuccess) errorMsg = 'Falha ao processar dados do colaborador.';
          break;

        case 'process-project':
          isSuccess = await this.processProjectRow(job.data.payload, job.data.companyId);
          if (!isSuccess) errorMsg = 'Falha ao processar dados do projeto.';
          break;
      }
    } catch (e: any) {
      this.logger.error(`Error in job ${job.id}: ${e.message}`);
      errorMsg = e.message;
    }

    if (itemId) {
      await this.prisma.import_items.update({
        where: { id: itemId },
        data: { status: isSuccess ? 'SUCCESS' : 'ERROR', error_message: errorMsg }
      });
      await this.updateBatchProgress(batchId, fileId, intakeId, fileJobId);
    }

    return { isSuccess };
  }

  private async updateBatchProgress(
    batchId: number,
    fileId?: string,
    intakeId?: string,
    fileJobId?: string,
  ) {
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    const itemsStatus = await this.prisma.import_items.groupBy({
      by: ['status'],
      where: { batch_id: batchId },
      _count: { id: true }
    });

    const successCount = itemsStatus.find(s => s.status === 'SUCCESS')?._count.id || 0;
    const errorCount = itemsStatus.find(s => s.status === 'ERROR')?._count.id || 0;
    const processed = successCount + errorCount;
    const total = batch?.total_records || 0;

    const updated = await this.prisma.import_batches.update({
      where: { id: batchId },
      data: {
        processed_records: processed,
        success_count: successCount,
        error_count: errorCount,
        status: processed >= total ? 'COMPLETED' : 'PROCESSING',
        updated_at: new Date()
      }
    });

    if (fileId && fileJobId && (processed % 5 === 0 || processed >= total)) {
      await this.fileHubService.markJobProgress(fileId, fileJobId, processed, total, intakeId ?? null);
    }

    if (updated.status === 'COMPLETED') {
      if (fileId && fileJobId) {
        await this.fileHubService.addArtifact(fileJobId, 'IMPORT_BATCH_SUMMARY', {
          batchId,
          successCount,
          errorCount,
          total,
        });
        await this.fileHubService.markJobCompleted(fileId, fileJobId, intakeId ?? null, {
          batchStatus: updated.status,
          successCount,
          errorCount,
          total,
        });
      }
      this.notificationsGateway.sendCompleted({ success: successCount, failed: errorCount, total });
    } else if (processed % 5 === 0) { 
      this.notificationsGateway.sendProgress({ current: processed, total, message: `Processando lote ${batchId}...` });
    }
  }

  private async importAndSaveCompany(cnpj: string): Promise<boolean> {
    try {
      const rawToken = this.configService.get<string>('RECEITA_WS_TOKEN') || '';
      const token = rawToken.replace(/"/g, '').trim();
      const baseUrl = 'https://www.receitaws.com.br/v1/cnpj/';
      const url = token ? `${baseUrl}${cnpj}/days/30` : `${baseUrl}${cnpj}`;
      
      const headers: any = { 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const { data } = await firstValueFrom(this.httpService.get(url, { headers, timeout: 15000 }));
      
      if (data.status === 'ERROR') {
        this.logger.warn(`ReceitaWS Error for ${cnpj}: ${data.message}`);
        return false;
      }

      const parseBrDate = (str?: string): Date | null => {
        if (!str) return null;
        const parts = str.split('/');
        if (parts.length !== 3) return null;
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00Z`);
      };

      const parseBrDecimal = (str?: string): number | null => {
        if (!str) return null;
        // ReceitaWS returns capital_social as standard decimal ("1658292882.00"),
        // not Brazilian format â€” parse directly without stripping dots.
        const n = parseFloat(str.replace(',', '.'));
        return isNaN(n) ? null : n;
      };

      const openDate = parseBrDate(data.abertura);
      const situationDate = parseBrDate(data.data_situacao);
      const capitalSocial = parseBrDecimal(data.capital_social);

      const companyFields = {
        legal_name: data.nome,
        trade_name: data.fantasia || null,
        email: data.email || null,
        legal_nature: data.natureza_juridica || null,
        porte: data.porte || null,
        capital_social: capitalSocial,
        situation: data.situacao || null,
        situation_reason: data.motivo_situacao || null,
        situation_date: situationDate,
      };

      const company = await this.prisma.companies.upsert({
        where: { cnpj },
        update: { ...companyFields, updated_at: new Date() },
        create: {
          cnpj,
          ...companyFields,
          open_date: openDate,
          status: 'OK',
        },
      });

      const phones = parseReceitaWSPhones(data.telefone);
      for (const ph of phones) {
        await (this.prisma as any).company_phones.create({
          data: { company_id: company.id, number: ph.number, type: ph.type, is_primary: ph.isPrimary }
        }).catch(() => null);
      }

      if (data.logradouro) {
        await this.prisma.addresses.deleteMany({ where: { company_id: company.id } });
        await this.prisma.addresses.create({
          data: {
            company_id: company.id,
            street: data.logradouro,
            number: data.numero || null,
            complement: data.complemento || null,
            neighborhood: data.bairro || null,
            city: data.municipio || null,
            state: data.uf || null,
            zip_code: data.cep ? data.cep.replace(/\D/g, '') : null,
          },
        });
      }

      await this.syncCnaes(company.id, data);
      await this.contactsService.syncContactsFromReceitaWS(company.id, data);
      return true;
    } catch { return false; }
  }

  private async syncCnaes(companyId: number, data: any): Promise<void> {
    const primary: any[] = data.atividade_principal || [];
    const secondary: any[] = data.atividades_secundarias || [];

    const all = [
      ...primary.map((a) => ({ code: a.code, description: a.text, isPrimary: true })),
      ...secondary.map((a) => ({ code: a.code, description: a.text, isPrimary: false })),
    ].filter((a) => a.code);

    for (const activity of all) {
      // Upsert the CNAE code reference
      await this.prisma.cnaes.upsert({
        where: { code: activity.code },
        update: { description: activity.description },
        create: { code: activity.code, description: activity.description },
      });

      // Upsert the company link
      const existing = await this.prisma.company_cnaes.findUnique({
        where: { company_id_cnae_code: { company_id: companyId, cnae_code: activity.code } },
      });
      if (existing) {
        await this.prisma.company_cnaes.update({
          where: { company_id_cnae_code: { company_id: companyId, cnae_code: activity.code } },
          data: { is_primary: activity.isPrimary },
        });
      } else {
        await this.prisma.company_cnaes.create({
          data: { company_id: companyId, cnae_code: activity.code, is_primary: activity.isPrimary },
        });
      }
    }
  }

  private async processContactRow(row: any, contextCompanyId?: number): Promise<boolean> {
    const name = row.Nome || row.Name || row.nome;
    const email = row.Email || row.email;
    const phoneStr = row.Telefone || row.Phone || row.telefone;
    const cnpj = row.CNPJ || row.cnpj;

    if (!name) return false;

    let companyId = contextCompanyId;
    if (!companyId && cnpj) {
      const company = await this.prisma.companies.findUnique({ where: { cnpj: String(cnpj).replace(/\D/g, '') } });
      companyId = company?.id;
    }

    if (!companyId) throw new Error('VÃ­nculo com empresa obrigatÃ³rio.');

    await this.contactsService.upsertContactComplete({
      name,
      email,
      phones: parseReceitaWSPhones(phoneStr),
      companyId: companyId,
      role: row.Cargo || row.Role || 'COMUM',
      notes: 'Importado via Excel',
    });

    return true;
  }

  private async processCollaboratorRow(row: any, contextCompanyId?: number): Promise<boolean> {
    const name = row.Nome || row.Name || row.nome;
    const email = row.Email || row.email;
    const cnpj = row.CNPJ || row.cnpj;
    if (!name) return false;

    let companyId = contextCompanyId;
    if (!companyId && cnpj) {
      const company = await this.prisma.companies.findUnique({ where: { cnpj: String(cnpj).replace(/\D/g, '') } });
      companyId = company?.id;
    }

    if (!companyId) throw new Error('VÃ­nculo com empresa obrigatÃ³rio.');

    const contact = await this.contactsService.upsertContactComplete({
      name,
      email,
      phones: parseReceitaWSPhones(row.Telefone || row.Phone),
      companyId: companyId,
      role: 'COLABORADOR',
      notes: 'Importado via Excel (Colaborador)',
    });

    await this.prisma.collaborators.upsert({
      where: { contact_id: (contact as any).id },
      update: {
        position: row.Cargo || row.Position,
        department: row.Departamento || row.Department,
        registration_number: String(row.Matricula || row.Registration || ''),
      },
      create: {
        contact_id: (contact as any).id,
        position: row.Cargo || row.Position,
        department: row.Departamento || row.Department,
        registration_number: String(row.Matricula || row.Registration || ''),
      }
    });

    return true;
  }

  private async processProjectRow(row: any, contextCompanyId?: number): Promise<boolean> {
    const name = row.Nome || row.Name || row.nome;
    const cnpj = row.CNPJ || row.cnpj;
    if (!name) return false;

    let companyId = contextCompanyId;
    if (!companyId && cnpj) {
      const company = await (this.prisma as any).companies.findUnique({ where: { cnpj: String(cnpj).replace(/\D/g, '') } });
      companyId = company?.id;
    }

    if (!companyId) throw new Error('VÃ­nculo com empresa obrigatÃ³rio.');

    await (this.projectsService as any).create({
      name,
      description: row.Descricao || row.Description || row.descricao,
      status: row.Status || row.status || 'PLANNED',
      start_date: row.DataInicio || row.StartDate || row.data_inicio,
      end_date: row.DataFim || row.EndDate || row.data_fim,
      company_id: companyId
    });

    return true;
  }

  /**
   * After a CNPJ job succeeds, if it was triggered to satisfy a FORMPD
   * COMPANY_NOT_FOUND batch, update that batch to PENDING_REVIEW and emit
   * a socket event so the frontend can prompt the user to review.
   */
  private async linkFormpdBatch(cnpj: string, formpd_batch_id: number) {
    try {
      const company = await this.prisma.companies.findUnique({
        where: { cnpj },
        select: { id: true, legal_name: true },
      });
      if (!company) return;

      // Update FORMPD batch
      await this.prisma.import_batches.update({
        where: { id: formpd_batch_id },
        data: { company_id: company.id, status: 'PENDING_REVIEW' },
      });

      // Patch the item's record_data with company info
      const item = await this.prisma.import_items.findFirst({
        where: { batch_id: formpd_batch_id },
      });
      if (item) {
        let parsed: any = {};
        try { parsed = JSON.parse(item.record_data); } catch { /* */ }
        parsed.company_id = company.id;
        parsed.company_name = company.legal_name;
        await this.prisma.import_items.update({
          where: { id: item.id },
          data: { record_data: JSON.stringify(parsed) },
        });
      }

      this.notificationsGateway.sendFormpdCompanyRegistered({
        batchId: formpd_batch_id,
        companyId: company.id,
        companyName: company.legal_name,
        cnpj,
      });

      this.logger.log(
        `FORMPD Batch ${formpd_batch_id} linked to company id=${company.id} after CNPJ registration`,
      );
    } catch (e: any) {
      this.logger.error(`linkFormpdBatch error: ${e.message}`);
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    const { fileId, intakeId, fileJobId } = (job?.data ?? {}) as {
      fileId?: string;
      intakeId?: string;
      fileJobId?: string;
    };
    if (fileId && fileJobId) {
      await this.fileHubService.markJobFailed(fileId, fileJobId, error.message, intakeId ?? null);
    }
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }
}
