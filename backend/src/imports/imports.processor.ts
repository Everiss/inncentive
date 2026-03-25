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
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { itemId, batchId } = job.data;
    let isSuccess = false;
    let errorMsg: string | null = null;

    // 1. Initial Batch Update
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (batch?.status === 'PENDING') {
      await this.prisma.import_batches.update({ where: { id: batchId }, data: { status: 'PROCESSING' } });
    }

    try {
      switch (job.name) {
        case 'process-cnpj':
          isSuccess = await this.importAndSaveCompany(job.data.cnpj);
          if (!isSuccess) errorMsg = 'Falha na ReceitaWS ou ao Salvar.';
          
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
      await this.updateBatchProgress(batchId);
    }

    return { isSuccess };
  }

  private async updateBatchProgress(batchId: number) {
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

    if (updated.status === 'COMPLETED') {
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

      let openDate = null;
      if (data.abertura) {
        const parts = data.abertura.split('/');
        if (parts.length === 3) openDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00Z`);
      }

      const company = await this.prisma.companies.upsert({
        where: { cnpj },
        update: {
          legal_name: data.nome,
          trade_name: data.fantasia || null,
          email: data.email || null,
          updated_at: new Date(),
        },
        create: {
          cnpj,
          legal_name: data.nome,
          trade_name: data.fantasia || null,
          open_date: openDate,
          email: data.email || null,
          status: 'OK',
        },
      });

      const phones = parseReceitaWSPhones(data.telefone);
      for (const ph of phones) {
        await (this.prisma as any).company_phones.create({
          data: { company_id: company.id, number: ph.number, type: ph.type, is_primary: ph.isPrimary }
        }).catch(() => null);
      }

      await this.contactsService.syncContactsFromReceitaWS(company.id, data);
      return true;
    } catch { return false; }
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

    if (!companyId) throw new Error('Vínculo com empresa obrigatório.');

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

    if (!companyId) throw new Error('Vínculo com empresa obrigatório.');

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

    if (!companyId) throw new Error('Vínculo com empresa obrigatório.');

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

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }
}
