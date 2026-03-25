import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const VALID_EXPENSE_CATEGORIES = new Set([
  'SERVICO_APOIO_PF', 'SERVICO_APOIO_PJ', 'MATERIAL_CONSUMO', 'TIB', 'DESPESA_OPERACIONAL',
]);

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    @InjectQueue('import-cnpjs') private readonly importCnpjsQueue: Queue,
    @InjectQueue('formpd-extraction') private readonly formpdQueue: Queue,
  ) {}

  private cleanCnpj(raw: string): string | null {
    if (!raw) return null;
    const onlyDigits = String(raw).replace(/\D/g, '');
    if (onlyDigits.length === 0) return null;
    return onlyDigits.padStart(14, '0');
  }

  async processCnpjFileInBackground(file: Express.Multer.File) {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data: any[] = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    const cnpjsToProcess = new Set<string>();
    for (const row of data) {
      const cnpjKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'cnpj');
      if (cnpjKey && row[cnpjKey]) {
        const cleaned = this.cleanCnpj(row[cnpjKey]);
        if (cleaned) cnpjsToProcess.add(cleaned);
      }
    }

    const total = cnpjsToProcess.size;
    if (total === 0) throw new BadRequestException('Nenhum CNPJ válido encontrado na planilha.');

    const batch = await this.prisma.import_batches.create({
      data: {
        file_name: file.originalname,
        entity_type: 'COMPANIES',
        status: 'PENDING',
        total_records: total,
      }
    });

    const itemsData = Array.from(cnpjsToProcess).map(cnpj => ({
      batch_id: batch.id,
      record_data: cnpj,
      status: 'PENDING'
    }));

    await this.prisma.import_items.createMany({ data: itemsData });
    const insertedItems = await this.prisma.import_items.findMany({
      where: { batch_id: batch.id },
      select: { id: true, record_data: true }
    });

    await this.importCnpjsQueue.addBulk(insertedItems.map(item => ({
      name: 'process-cnpj',
      data: { itemId: item.id, batchId: batch.id, cnpj: item.record_data }
    })));

    this.notificationsGateway.sendProgress({ current: 0, total, message: `Lote ${batch.id} enviado para a fila.` });
  }

  async processContactsFile(file: Express.Multer.File, companyId?: number) {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const data: any[] = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

    if (data.length === 0) throw new BadRequestException('Planilha vazia.');

    const batch = await this.prisma.import_batches.create({
      data: {
        file_name: file.originalname,
        entity_type: 'CONTACTS',
        status: 'PENDING',
        total_records: data.length,
      }
    });

    await this.prisma.import_items.createMany({
      data: data.map(row => ({
        batch_id: batch.id,
        record_data: JSON.stringify(row),
        status: 'PENDING'
      }))
    });

    const insertedItems = await this.prisma.import_items.findMany({ where: { batch_id: batch.id } });

    await this.importCnpjsQueue.addBulk(insertedItems.map(item => ({
      name: 'process-contact',
      data: { itemId: item.id, batchId: batch.id, payload: JSON.parse(item.record_data), companyId }
    })));

    this.notificationsGateway.sendProgress({ current: 0, total: data.length, message: `Importação de contatos #${batch.id} iniciada.` });
  }

  async processCollaboratorsFile(file: Express.Multer.File, companyId?: number) {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const data: any[] = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

    if (data.length === 0) throw new BadRequestException('Planilha vazia.');

    const batch = await this.prisma.import_batches.create({
      data: {
        file_name: file.originalname,
        entity_type: 'COLLABORATORS',
        status: 'PENDING',
        total_records: data.length,
      }
    });

    await this.prisma.import_items.createMany({
      data: data.map(row => ({
        batch_id: batch.id,
        record_data: JSON.stringify(row),
        status: 'PENDING'
      }))
    });

    const insertedItems = await this.prisma.import_items.findMany({ where: { batch_id: batch.id } });

    await this.importCnpjsQueue.addBulk(insertedItems.map(item => ({
      name: 'process-collaborator',
      data: { itemId: item.id, batchId: batch.id, payload: JSON.parse(item.record_data), companyId }
    })));

    this.notificationsGateway.sendProgress({ current: 0, total: data.length, message: `Importação de colaboradores #${batch.id} iniciada.` });
  }

  async processProjectsFile(file: Express.Multer.File, companyId?: number) {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const data: any[] = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

    if (data.length === 0) throw new BadRequestException('Planilha vazia.');

    const batch = await this.prisma.import_batches.create({
      data: {
        file_name: file.originalname,
        entity_type: 'PROJECTS',
        status: 'PENDING',
        total_records: data.length,
      }
    });

    await this.prisma.import_items.createMany({
      data: data.map(row => ({
        batch_id: batch.id,
        record_data: JSON.stringify(row),
        status: 'PENDING'
      }))
    });

    const insertedItems = await this.prisma.import_items.findMany({ where: { batch_id: batch.id } });

    await this.importCnpjsQueue.addBulk(insertedItems.map(item => ({
      name: 'process-project',
      data: { itemId: item.id, batchId: batch.id, payload: JSON.parse(item.record_data), companyId }
    })));

    this.notificationsGateway.sendProgress({ current: 0, total: data.length, message: `Importação de projetos #${batch.id} iniciada.` });
  }

  /**
   * Process FORMP&D PDF using AI extraction via Valkey queue.
   * If sourceCompanyId is provided (upload from inside company detail), the processor
   * will compare the extracted CNPJ against that company's CNPJ before approving.
   */
  async processFormpdPdf(file: Express.Multer.File, sourceCompanyId?: number) {
    this.logger.log(`Starting FORMP&D IA extraction — sourceCompanyId=${sourceCompanyId ?? 'none'}`);

    const batch = await this.prisma.import_batches.create({
      data: {
        entity_type: 'FORMPD_AI_EXTRACTION',
        file_name: file.originalname,
        status: 'PENDING',
        total_records: 1,
        // Set company_id immediately when uploading from inside a company page
        company_id: sourceCompanyId ?? null,
      }
    });

    await this.formpdQueue.add('extract-pdf', {
      batchId: batch.id,
      filePath: file.path,
      sourceCompanyId: sourceCompanyId ?? null,
    }, {
      attempts: 3,
      backoff: { type: 'fixed', delay: 5000 },
    });

    this.notificationsGateway.sendProgress({ current: 0, total: 1, message: `PDF enviado para processamento por IA.` });

    return {
      success: true,
      batchId: batch.id,
      message: 'Arquivo enfileirado para extração via IA.',
    };
  }

  /**
   * Register the company extracted from a COMPANY_NOT_FOUND FORMPD batch.
   * Triggers a high-priority CNPJ import job that will, upon success, link
   * back to this FORMPD batch and transition it to PENDING_REVIEW.
   */
  async registerCompanyForBatch(batchId: number) {
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote não encontrado');
    if (batch.status !== 'COMPANY_NOT_FOUND') {
      throw new BadRequestException(`Lote não está no estado COMPANY_NOT_FOUND (status atual: ${batch.status})`);
    }

    const item = await this.prisma.import_items.findFirst({ where: { batch_id: batchId } });
    if (!item) throw new BadRequestException('Sem dados de extração para este lote');

    let parsed: any;
    try { parsed = JSON.parse(item.record_data); } catch {
      throw new BadRequestException('Dados de extração corrompidos');
    }

    const cnpj = parsed.cnpj_from_form;
    if (!cnpj) throw new BadRequestException('CNPJ não encontrado nos dados extraídos');

    // Create a CNPJ import batch
    const cnpjBatch = await this.prisma.import_batches.create({
      data: {
        file_name: `auto-register-${cnpj}`,
        entity_type: 'COMPANIES',
        status: 'PENDING',
        total_records: 1,
      }
    });
    const cnpjItem = await this.prisma.import_items.create({
      data: { batch_id: cnpjBatch.id, record_data: cnpj, status: 'PENDING' }
    });

    await this.importCnpjsQueue.add('process-cnpj', {
      itemId: cnpjItem.id,
      batchId: cnpjBatch.id,
      cnpj,
      formpd_batch_id: batchId,   // callback: link FORMPD batch once company is saved
    }, { priority: 1, attempts: 3, backoff: { type: 'fixed', delay: 3000 } });

    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: { status: 'AWAITING_COMPANY' },
    });

    return { success: true, cnpj };
  }

  /**
   * Discard a FORMPD batch: move the PDF to the rejected folder and mark as DISCARDED.
   */
  async discardBatch(batchId: number) {
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote não encontrado');

    const item = await this.prisma.import_items.findFirst({ where: { batch_id: batchId } });
    if (item) {
      try {
        const parsed = JSON.parse(item.record_data);
        const filePath: string | null = parsed.file_path ?? null;
        if (filePath && fs.existsSync(filePath)) {
          const rejectedDir = path.join(process.cwd(), 'upload', 'rejected', 'FORM');
          fs.mkdirSync(rejectedDir, { recursive: true });
          const dest = path.join(rejectedDir, path.basename(filePath));
          fs.renameSync(filePath, dest);
          this.logger.log(`Batch ${batchId}: arquivo movido para rejeitados`);
        }
      } catch (e: any) {
        this.logger.warn(`Batch ${batchId}: não foi possível mover arquivo — ${e.message}`);
      }
    }

    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: { status: 'DISCARDED', updated_at: new Date() },
    });

    return { success: true };
  }

  /**
   * Approve a FORMPD batch: promote extracted data into formpd_forms, formpd_projects,
   * formpd_project_human_resources, and formpd_project_expenses.
   */
  async approveBatch(batchId: number) {
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote não encontrado');
    if (!batch.company_id) {
      throw new BadRequestException('Empresa não identificada neste lote — não é possível aprovar');
    }

    const item = await this.prisma.import_items.findFirst({ where: { batch_id: batchId } });
    if (!item) throw new BadRequestException('Sem dados de extração');

    let parsed: any;
    try { parsed = JSON.parse(item.record_data); } catch {
      throw new BadRequestException('Dados de extração corrompidos');
    }

    const formData = parsed.form_data || parsed;
    const baseYear: number | undefined = formData?.fiscal_year;
    if (!baseYear || typeof baseYear !== 'number') {
      throw new BadRequestException('Ano fiscal não identificado nos dados extraídos');
    }

    // Upsert formpd_forms (unique per company + year)
    const form = await (this.prisma as any).formpd_forms.upsert({
      where: { company_id_base_year: { company_id: batch.company_id, base_year: baseYear } },
      update: {
        fiscal_loss: formData.fiscal_loss ?? false,
        fiscal_loss_amount: formData.fiscal_loss_amount ?? null,
        status: 'EM_PREENCHIMENTO',
        updated_at: new Date(),
      },
      create: {
        company_id: batch.company_id,
        base_year: baseYear,
        fiscal_loss: formData.fiscal_loss ?? false,
        fiscal_loss_amount: formData.fiscal_loss_amount ?? null,
        status: 'EM_PREENCHIMENTO',
      },
    });

    // Create projects with their HR and expenses
    for (const proj of formData.projects ?? []) {
      const createdProj = await (this.prisma as any).formpd_projects.create({
        data: {
          form_id: form.id,
          title: proj.title || 'Sem título',
          description: proj.description || '',
          is_continuous: proj.is_continuous ?? false,
        },
      });

      for (const hr of proj.human_resources ?? []) {
        await (this.prisma as any).formpd_project_human_resources.create({
          data: {
            project_id: createdProj.id,
            name: hr.name || 'Desconhecido',
            role: hr.role ?? null,
            dedication_pct: hr.dedication_pct ?? null,
            annual_amount: hr.annual_amount ?? null,
          },
        });
      }

      for (const exp of proj.expenses ?? []) {
        const category = VALID_EXPENSE_CATEGORIES.has(exp.category)
          ? exp.category
          : 'DESPESA_OPERACIONAL';
        await (this.prisma as any).formpd_project_expenses.create({
          data: {
            project_id: createdProj.id,
            expense_category: category,
            description: exp.description ?? null,
            amount: exp.amount ?? 0,
          },
        });
      }
    }

    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: { status: 'APPROVED', updated_at: new Date() },
    });

    await this.prisma.import_items.updateMany({
      where: { batch_id: batchId },
      data: { status: 'SUCCESS' },
    });

    this.logger.log(`Batch ${batchId} aprovado — formId=${form.id}, ano=${baseYear}`);
    return { success: true, formId: form.id, baseYear };
  }

  async deleteBatch(batchId: number) {
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote não encontrado');

    // Delete items first (cascade may handle this, but explicit is safer)
    await this.prisma.import_items.deleteMany({ where: { batch_id: batchId } });
    await this.prisma.import_batches.delete({ where: { id: batchId } });

    this.logger.log(`Batch ${batchId} deleted by user`);
    return { success: true };
  }

  async checkCnpj(rawCnpj: string) {
    const cnpj = rawCnpj.replace(/\D/g, '').padStart(14, '0');
    const company = await this.prisma.companies.findUnique({
      where: { cnpj },
      select: { id: true, cnpj: true, legal_name: true },
    });
    return { found: !!company, company: company ?? null };
  }

  async getBatches(companyId?: number, entityType?: string) {
    return this.prisma.import_batches.findMany({
      where: {
        ...(companyId  ? { company_id: companyId }  : {}),
        ...(entityType ? { entity_type: entityType } : {}),
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async getBatchItems(batchId: number, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.import_items.findMany({
        where: { batch_id: batchId },
        skip,
        take: limit,
        orderBy: { id: 'asc' }
      }),
      this.prisma.import_items.count({ where: { batch_id: batchId } })
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async reprocessBatch(batchId: number) {
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote não encontrado');

    const failedItems = await this.prisma.import_items.findMany({
      where: { batch_id: batchId, status: 'ERROR' }
    });

    if (failedItems.length === 0) {
      throw new BadRequestException('Não há itens com falha para reprocessar neste lote.');
    }

    await this.prisma.import_items.updateMany({
      where: { batch_id: batchId, status: 'ERROR' },
      data: { status: 'PENDING', error_message: null }
    });

    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: {
        status: 'PROCESSING',
        processed_records: batch.processed_records - failedItems.length,
        error_count: 0
      }
    });

    const jobsToPush = failedItems.map(item => ({
      name: 'process-cnpj',
      data: { itemId: item.id, batchId: batch.id, cnpj: item.record_data }
    }));

    await this.importCnpjsQueue.addBulk(jobsToPush);
    this.notificationsGateway.sendProgress({
      current: batch.processed_records - failedItems.length,
      total: batch.total_records,
      message: `Reprocessando ${failedItems.length} CNPJs no lote ${batch.id}...`
    });

    return { message: 'Reprocessamento iniciado.', count: failedItems.length };
  }
}
