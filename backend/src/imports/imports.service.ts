import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import * as xlsx from 'xlsx';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

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
    if (total === 0) throw new BadRequestException("Nenhum CNPJ válido encontrado na planilha.");

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

    if (data.length === 0) throw new BadRequestException("Planilha vazia.");

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

    const insertedItems = await this.prisma.import_items.findMany({
      where: { batch_id: batch.id },
    });

    await this.importCnpjsQueue.addBulk(insertedItems.map(item => ({
      name: 'process-contact',
      data: { itemId: item.id, batchId: batch.id, payload: JSON.parse(item.record_data), companyId }
    })));

    this.notificationsGateway.sendProgress({ current: 0, total: data.length, message: `Importação de contatos #${batch.id} iniciada.` });
  }

  async processCollaboratorsFile(file: Express.Multer.File, companyId?: number) {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const data: any[] = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

    if (data.length === 0) throw new BadRequestException("Planilha vazia.");

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

    const insertedItems = await this.prisma.import_items.findMany({
      where: { batch_id: batch.id },
    });

    await this.importCnpjsQueue.addBulk(insertedItems.map(item => ({
      name: 'process-collaborator',
      data: { itemId: item.id, batchId: batch.id, payload: JSON.parse(item.record_data), companyId }
    })));

    this.notificationsGateway.sendProgress({ current: 0, total: data.length, message: `Importação de colaboradores #${batch.id} iniciada.` });
  }

  async processProjectsFile(file: Express.Multer.File, companyId?: number) {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const data: any[] = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

    if (data.length === 0) throw new BadRequestException("Planilha vazia.");

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

    const insertedItems = await this.prisma.import_items.findMany({
      where: { batch_id: batch.id },
    });

    await this.importCnpjsQueue.addBulk(insertedItems.map(item => ({
      name: 'process-project',
      data: { itemId: item.id, batchId: batch.id, payload: JSON.parse(item.record_data), companyId }
    })));

    this.notificationsGateway.sendProgress({ current: 0, total: data.length, message: `Importação de projetos #${batch.id} iniciada.` });
  }

  /**
   * Process FORMP&D PDF using AI extraction via Valkey queue.
   * CNPJ and fiscal year are both extracted from the PDF by the AI.
   */
  async processFormpdPdf(file: Express.Multer.File) {
    this.logger.log(`Starting FORMP&D IA extraction flow — year and CNPJ will be extracted by AI`);

    const batch = await this.prisma.import_batches.create({
      data: {
        entity_type: 'FORMPD_AI_EXTRACTION',
        file_name: file.originalname,
        status: 'PENDING',
        total_records: 1,
      }
    });

    await this.formpdQueue.add('extract-pdf', {
      batchId: batch.id,
      filePath: file.path,
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
   * Check if a CNPJ is already registered in the companies table.
   */
  async checkCnpj(rawCnpj: string) {
    const cnpj = rawCnpj.replace(/\D/g, '').padStart(14, '0');
    const company = await this.prisma.companies.findUnique({
      where: { cnpj },
      select: { id: true, cnpj: true, legal_name: true },
    });
    return { found: !!company, company: company ?? null };
  }

  async getBatches() {
    return this.prisma.import_batches.findMany({
      orderBy: { created_at: 'desc' }
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

    // Reset items to PENDING
    await this.prisma.import_items.updateMany({
      where: { batch_id: batchId, status: 'ERROR' },
      data: { status: 'PENDING', error_message: null }
    });

    // Update batch stats
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
    this.notificationsGateway.sendProgress({ current: batch.processed_records - failedItems.length, total: batch.total_records, message: `Reprocessando ${failedItems.length} CNPJs no lote ${batch.id}...` });

    return { message: 'Reprocessamento iniciado.', count: failedItems.length };
  }
}
