import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { FileHubService } from '../file-hub/file-hub.service';

// Enum values accepted by formpd_project_expenses_expense_category
const VALID_EXPENSE_CATEGORIES = new Set([
  'SERVICO_APOIO_PF', 'SERVICO_APOIO_PJ', 'MATERIAL_CONSUMO', 'TIB', 'DESPESA_OPERACIONAL',
]);

/**
 * Maps AI-extracted expense category strings to the DB enum values.
 * Categories not in this map fall back to DESPESA_OPERACIONAL.
 */
const AI_EXPENSE_CATEGORY_MAP: Record<string, string> = {
  // AI variants → canonical DB enum
  MATERIAL_DE_CONSUMO:                     'MATERIAL_CONSUMO',
  MATERIAL_CONSUMO:                        'MATERIAL_CONSUMO',
  SERVICOS_TERCEIROS_INSTITUICAO_PESQUISA: 'SERVICO_APOIO_PJ',
  SERVICOS_TERCEIROS_APOIO_TECNICO:        'SERVICO_APOIO_PJ',
  SERVICO_APOIO_PJ:                        'SERVICO_APOIO_PJ',
  SERVICOS_TERCEIROS_PF:                   'SERVICO_APOIO_PF',
  SERVICO_APOIO_PF:                        'SERVICO_APOIO_PF',
  TIB:                                     'TIB',
  DESPESA_OPERACIONAL:                     'DESPESA_OPERACIONAL',
};

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    @InjectQueue('import-cnpjs') private readonly importCnpjsQueue: Queue,
    @InjectQueue('formpd-extraction') private readonly formpdQueue: Queue,
    private readonly fileHubService: FileHubService,
  ) {}

  private cleanCnpj(raw: string): string | null {
    if (!raw) return null;
    const onlyDigits = String(raw).replace(/\D/g, '');
    if (onlyDigits.length === 0) return null;
    return onlyDigits.padStart(14, '0');
  }
  private computeSha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private async registerImportFileTracking(input: {
    batchId: number;
    file: Express.Multer.File;
    entityType: 'COMPANIES' | 'CONTACTS' | 'COLLABORATORS' | 'PROJECTS' | 'FORMPD_AI_EXTRACTION';
    companyId?: number;
  }) {
    const { batchId, file, entityType, companyId } = input;
    const fileHash = this.computeSha256(file.buffer);

    const intake = await this.fileHubService.registerUploadIntake({
      filePath: file.path ?? `memory://imports/${entityType}/${Date.now()}-${file.originalname}`,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      companyId: companyId ?? null,
      source: `IMPORT_${entityType}`,
      sourceRef: `batch:${batchId}`,
      hash: fileHash,
    });

    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: { file_id: intake.fileId },
    });

    return { intake, fileHash };
  }

  private async tryReuseCachedFormpdExtraction(
    batchId: number,
    filePath: string,
    fileHash: string,
    sourceCompanyId?: number,
  ): Promise<boolean> {
    const hashNeedle = `"file_sha256":"${fileHash}"`;
    const cachedItems = await this.prisma.import_items.findMany({
      where: {
        record_data: { contains: hashNeedle },
        batch: {
          entity_type: 'FORMPD_AI_EXTRACTION',
          id: { not: batchId },
        },
      },
      orderBy: { id: 'desc' },
      take: 30,
      select: {
        id: true,
        record_data: true,
        batch: {
          select: {
            id: true,
            status: true,
            company_id: true,
          },
        },
      },
    });

    if (cachedItems.length === 0) return false;

    const sourceCompany = sourceCompanyId
      ? await this.prisma.companies.findUnique({
          where: { id: sourceCompanyId },
          select: { id: true, cnpj: true, legal_name: true },
        })
      : null;
    const sourceCompanyCnpj = sourceCompany?.cnpj?.replace(/\D/g, '') ?? null;

    for (const cached of cachedItems) {
      if (!cached.batch) continue;
      if (!['PENDING_REVIEW', 'APPROVED', 'COMPANY_NOT_FOUND', 'AWAITING_COMPANY'].includes(cached.batch.status)) {
        continue;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(cached.record_data);
      } catch {
        continue;
      }

      if (!parsed?.is_valid_formpd) continue;
      const parsedCnpj = parsed?.cnpj_from_form ? String(parsed.cnpj_from_form).replace(/\D/g, '') : null;
      const parsedCompanyId = parsed?.company_id ? Number(parsed.company_id) : null;

      if (sourceCompanyId) {
        if (!sourceCompanyCnpj || !parsedCnpj || parsedCnpj !== sourceCompanyCnpj) {
          continue;
        }
      }

      const resolvedCompanyId = sourceCompanyId ?? parsedCompanyId ?? cached.batch.company_id ?? null;
      const resolvedCompanyName =
        sourceCompany?.legal_name ?? parsed?.company_name ?? null;
      const resolvedStatus = sourceCompanyId
        ? 'PENDING_REVIEW'
        : (cached.batch.status === 'COMPANY_NOT_FOUND' || cached.batch.status === 'AWAITING_COMPANY'
          ? cached.batch.status
          : 'PENDING_REVIEW');

      const reusedRecordData = {
        ...parsed,
        company_id: resolvedCompanyId,
        company_name: resolvedCompanyName,
        file_path: filePath,
        file_sha256: fileHash,
      };

      await this.prisma.import_items.create({
        data: {
          batch_id: batchId,
          record_data: JSON.stringify(reusedRecordData),
          status: resolvedStatus,
          error_message: null,
        },
      });

      await this.prisma.import_batches.update({
        where: { id: batchId },
        data: {
          status: resolvedStatus,
          company_id: resolvedCompanyId,
          total_records: 1,
          processed_records: 1,
          success_count: resolvedStatus === 'PENDING_REVIEW' ? 1 : 0,
          error_count: 0,
          updated_at: new Date(),
        },
      });

      this.notificationsGateway.sendProgress({
        current: 1,
        total: 1,
        message: `Lote ${batchId}: arquivo reaproveitado do cache (sem reprocessar IA).`,
      });

      this.notificationsGateway.sendFormpdCompleted({
        batchId,
        status: resolvedStatus === 'COMPANY_NOT_FOUND' ? 'COMPANY_NOT_FOUND' : 'PENDING_REVIEW',
        cnpjFromForm: parsedCnpj,
        companyId: resolvedCompanyId,
        companyName: resolvedCompanyName,
      });

      return true;
    }

    return false;
  }

  private async tryReuseCompletedTabularBatch(input: {
    batchId: number;
    entityType: 'COMPANIES' | 'CONTACTS' | 'COLLABORATORS' | 'PROJECTS';
    fileId: string;
    intakeId: string;
    fileJobId: string;
    companyId?: number;
  }): Promise<boolean> {
    const { batchId, entityType, fileId, intakeId, fileJobId, companyId } = input;

    const previousBatch = await this.prisma.import_batches.findFirst({
      where: {
        id: { not: batchId },
        entity_type: entityType,
        file_id: fileId,
        status: 'COMPLETED',
        ...(companyId ? { company_id: companyId } : {}),
      },
      orderBy: { id: 'desc' },
      include: {
        items: {
          orderBy: { id: 'asc' },
          select: {
            record_data: true,
            status: true,
            error_message: true,
            file_job_id: true,
          },
        },
      },
    });

    if (!previousBatch) return false;

    if (previousBatch.items.length > 0) {
      await this.prisma.import_items.createMany({
        data: previousBatch.items.map((item) => ({
          batch_id: batchId,
          file_job_id: fileJobId ?? item.file_job_id ?? null,
          record_data: item.record_data,
          status: item.status,
          error_message: item.error_message,
        })),
      });
    }

    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: {
        status: 'COMPLETED',
        company_id: companyId ?? previousBatch.company_id ?? null,
        total_records: previousBatch.total_records,
        processed_records: previousBatch.processed_records,
        success_count: previousBatch.success_count,
        error_count: previousBatch.error_count,
        updated_at: new Date(),
      },
    });

    await (this.prisma as any).file_intakes.update({
      where: { id: intakeId },
      data: { intake_status: 'DONE', dedup_hit: true, finished_at: new Date() },
    });

    await this.fileHubService.addArtifact(fileJobId, 'IMPORT_BATCH_SUMMARY', {
      batchId,
      dedupFromBatchId: previousBatch.id,
      dedup: true,
      total: previousBatch.total_records,
      success: previousBatch.success_count,
      failed: previousBatch.error_count,
    });
    await this.fileHubService.markJobCompleted(fileId, fileJobId, intakeId, {
      dedup: true,
      dedupFromBatchId: previousBatch.id,
    });

    this.notificationsGateway.sendProgress({
      current: previousBatch.processed_records,
      total: previousBatch.total_records,
      message: `Lote ${batchId}: reaproveitado do cache (batch ${previousBatch.id}).`,
    });
    this.notificationsGateway.sendCompleted({
      success: previousBatch.success_count,
      failed: previousBatch.error_count,
      total: previousBatch.total_records,
    });

    return true;
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
    if (total === 0) throw new BadRequestException('Nenhum CNPJ vÃ¡lido encontrado na planilha.');

    const batch = await this.prisma.import_batches.create({
      data: {
        file_name: file.originalname,
        entity_type: 'COMPANIES',
        status: 'PENDING',
        total_records: total,
      }
    });

    const { intake } = await this.registerImportFileTracking({
      batchId: batch.id,
      file,
      entityType: 'COMPANIES',
    });

    const fileJob = await this.fileHubService.createProcessingJob({
      fileId: intake.fileId,
      intakeId: intake.intakeId,
      jobType: 'COMPANIES_IMPORT',
      processor: 'IMPORTS_PROCESSOR',
      processorVersion: 'v1',
      priority: 5,
      idempotencyKey: `companies:${intake.fileId}:v1`,
    });

    const reused = await this.tryReuseCompletedTabularBatch({
      batchId: batch.id,
      entityType: 'COMPANIES',
      fileId: intake.fileId,
      intakeId: intake.intakeId,
      fileJobId: fileJob.id,
    });
    if (reused) {
      return {
        success: true,
        batchId: batch.id,
        dedupHit: true,
        message: 'Arquivo já processado anteriormente. Lote reutilizado sem reprocessamento.',
      };
    }

    const itemsData = Array.from(cnpjsToProcess).map(cnpj => ({
      batch_id: batch.id,
      record_data: cnpj,
      status: 'PENDING'
    }));

    await this.prisma.import_items.createMany({ data: itemsData });
    await this.prisma.import_items.updateMany({
      where: { batch_id: batch.id },
      data: { file_job_id: fileJob.id },
    });
    const insertedItems = await this.prisma.import_items.findMany({
      where: { batch_id: batch.id },
      select: { id: true, record_data: true }
    });

    await this.importCnpjsQueue.addBulk(insertedItems.map(item => ({
      name: 'process-cnpj',
      data: {
        itemId: item.id,
        batchId: batch.id,
        cnpj: item.record_data,
        fileId: intake.fileId,
        intakeId: intake.intakeId,
        fileJobId: fileJob.id,
      }
    })));

    this.notificationsGateway.sendProgress({ current: 0, total, message: `Lote ${batch.id} enviado para a fila.` });
    return { success: true, batchId: batch.id, dedupHit: false };
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

    const { intake } = await this.registerImportFileTracking({
      batchId: batch.id,
      file,
      entityType: 'CONTACTS',
      companyId,
    });

    const fileJob = await this.fileHubService.createProcessingJob({
      fileId: intake.fileId,
      intakeId: intake.intakeId,
      jobType: 'CONTACTS_IMPORT',
      processor: 'IMPORTS_PROCESSOR',
      processorVersion: 'v1',
      priority: 5,
      idempotencyKey: `contacts:${intake.fileId}:v1`,
    });

    const reused = await this.tryReuseCompletedTabularBatch({
      batchId: batch.id,
      entityType: 'CONTACTS',
      fileId: intake.fileId,
      intakeId: intake.intakeId,
      fileJobId: fileJob.id,
      companyId,
    });
    if (reused) {
      return {
        success: true,
        batchId: batch.id,
        dedupHit: true,
        message: 'Arquivo já processado anteriormente. Lote reutilizado sem reprocessamento.',
      };
    }

    await this.prisma.import_items.createMany({
      data: data.map(row => ({
        batch_id: batch.id,
        record_data: JSON.stringify(row),
        status: 'PENDING'
      }))
    });

    await this.prisma.import_items.updateMany({
      where: { batch_id: batch.id },
      data: { file_job_id: fileJob.id },
    });

    const insertedItems = await this.prisma.import_items.findMany({ where: { batch_id: batch.id } });

    await this.importCnpjsQueue.addBulk(insertedItems.map(item => ({
      name: 'process-contact',
      data: {
        itemId: item.id,
        batchId: batch.id,
        payload: JSON.parse(item.record_data),
        companyId,
        fileId: intake.fileId,
        intakeId: intake.intakeId,
        fileJobId: fileJob.id,
      }
    })));

    this.notificationsGateway.sendProgress({ current: 0, total: data.length, message: `ImportaÃ§Ã£o de contatos #${batch.id} iniciada.` });
    return { success: true, batchId: batch.id, dedupHit: false };
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

    const { intake } = await this.registerImportFileTracking({
      batchId: batch.id,
      file,
      entityType: 'COLLABORATORS',
      companyId,
    });

    const fileJob = await this.fileHubService.createProcessingJob({
      fileId: intake.fileId,
      intakeId: intake.intakeId,
      jobType: 'COLLABORATORS_IMPORT',
      processor: 'IMPORTS_PROCESSOR',
      processorVersion: 'v1',
      priority: 5,
      idempotencyKey: `collaborators:${intake.fileId}:v1`,
    });

    const reused = await this.tryReuseCompletedTabularBatch({
      batchId: batch.id,
      entityType: 'COLLABORATORS',
      fileId: intake.fileId,
      intakeId: intake.intakeId,
      fileJobId: fileJob.id,
      companyId,
    });
    if (reused) {
      return {
        success: true,
        batchId: batch.id,
        dedupHit: true,
        message: 'Arquivo já processado anteriormente. Lote reutilizado sem reprocessamento.',
      };
    }

    await this.prisma.import_items.createMany({
      data: data.map(row => ({
        batch_id: batch.id,
        record_data: JSON.stringify(row),
        status: 'PENDING'
      }))
    });

    await this.prisma.import_items.updateMany({
      where: { batch_id: batch.id },
      data: { file_job_id: fileJob.id },
    });

    const insertedItems = await this.prisma.import_items.findMany({ where: { batch_id: batch.id } });

    await this.importCnpjsQueue.addBulk(insertedItems.map(item => ({
      name: 'process-collaborator',
      data: {
        itemId: item.id,
        batchId: batch.id,
        payload: JSON.parse(item.record_data),
        companyId,
        fileId: intake.fileId,
        intakeId: intake.intakeId,
        fileJobId: fileJob.id,
      }
    })));

    this.notificationsGateway.sendProgress({ current: 0, total: data.length, message: `ImportaÃ§Ã£o de colaboradores #${batch.id} iniciada.` });
    return { success: true, batchId: batch.id, dedupHit: false };
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

    const { intake } = await this.registerImportFileTracking({
      batchId: batch.id,
      file,
      entityType: 'PROJECTS',
      companyId,
    });

    const fileJob = await this.fileHubService.createProcessingJob({
      fileId: intake.fileId,
      intakeId: intake.intakeId,
      jobType: 'PROJECTS_IMPORT',
      processor: 'IMPORTS_PROCESSOR',
      processorVersion: 'v1',
      priority: 5,
      idempotencyKey: `projects:${intake.fileId}:v1`,
    });

    const reused = await this.tryReuseCompletedTabularBatch({
      batchId: batch.id,
      entityType: 'PROJECTS',
      fileId: intake.fileId,
      intakeId: intake.intakeId,
      fileJobId: fileJob.id,
      companyId,
    });
    if (reused) {
      return {
        success: true,
        batchId: batch.id,
        dedupHit: true,
        message: 'Arquivo já processado anteriormente. Lote reutilizado sem reprocessamento.',
      };
    }

    await this.prisma.import_items.createMany({
      data: data.map(row => ({
        batch_id: batch.id,
        record_data: JSON.stringify(row),
        status: 'PENDING'
      }))
    });

    await this.prisma.import_items.updateMany({
      where: { batch_id: batch.id },
      data: { file_job_id: fileJob.id },
    });

    const insertedItems = await this.prisma.import_items.findMany({ where: { batch_id: batch.id } });

    await this.importCnpjsQueue.addBulk(insertedItems.map(item => ({
      name: 'process-project',
      data: {
        itemId: item.id,
        batchId: batch.id,
        payload: JSON.parse(item.record_data),
        companyId,
        fileId: intake.fileId,
        intakeId: intake.intakeId,
        fileJobId: fileJob.id,
      }
    })));

    this.notificationsGateway.sendProgress({ current: 0, total: data.length, message: `ImportaÃ§Ã£o de projetos #${batch.id} iniciada.` });
    return { success: true, batchId: batch.id, dedupHit: false };
  }

  /**
   * Process FORMP&D PDF using AI extraction via Valkey queue.
   * If sourceCompanyId is provided (upload from inside company detail), the processor
   * will compare the extracted CNPJ against that company's CNPJ before approving.
   */
  async processFormpdPdf(file: Express.Multer.File, sourceCompanyId?: number) {
    this.logger.log(`Starting FORMP&D IA extraction — sourceCompanyId=${sourceCompanyId ?? 'none'}`);
    const fileHash = this.computeSha256(file.buffer);

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
    const intake = await this.fileHubService.registerUploadIntake({
      filePath: file.path,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      companyId: sourceCompanyId ?? null,
      source: 'IMPORT_FORMPD_AI',
      sourceRef: `batch:${batch.id}`,
      hash: fileHash,
    });

    await this.prisma.import_batches.update({
      where: { id: batch.id },
      data: { file_id: intake.fileId },
    });

    // Try reuse from a previously extracted file with the same content hash.
    const reused = await this.tryReuseCachedFormpdExtraction(batch.id, file.path, fileHash, sourceCompanyId);
    if (reused) {
      await (this.prisma as any).file_intakes.update({
        where: { id: intake.intakeId },
        data: { intake_status: 'DONE', dedup_hit: true, finished_at: new Date() },
      });
      this.logger.log(`FORMP&D dedup hit for batch ${batch.id} (sha256=${fileHash})`);
      return {
        success: true,
        batchId: batch.id,
        dedupHit: true,
        message: 'Arquivo já processado anteriormente. Resultado reaproveitado do cache.',
      };
    }
    const fileJob = await this.fileHubService.createProcessingJob({
      fileId: intake.fileId,
      intakeId: intake.intakeId,
      jobType: 'FORMPD_EXTRACTION',
      processor: 'FORMPD_EXTRACTION_PROCESSOR',
      processorVersion: 'v1',
      priority: 4,
      idempotencyKey: `formpd:${intake.fileId}:v1`,
    });

    await this.formpdQueue.add('extract-pdf', {
      batchId: batch.id,
      filePath: file.path,
      sourceCompanyId: sourceCompanyId ?? null,
      fileHash,
      fileId: intake.fileId,
      intakeId: intake.intakeId,
      fileJobId: fileJob.id,
    }, {
      attempts: 3,
      backoff: { type: 'fixed', delay: 5000 },
    });

    this.notificationsGateway.sendProgress({ current: 0, total: 1, message: `PDF enviado para processamento por IA.` });

    return {
      success: true,
      batchId: batch.id,
      dedupHit: false,
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
    if (!batch) throw new NotFoundException('Lote nÃ£o encontrado');
    if (batch.status !== 'COMPANY_NOT_FOUND') {
      throw new BadRequestException(`Lote nÃ£o estÃ¡ no estado COMPANY_NOT_FOUND (status atual: ${batch.status})`);
    }

    const item = await this.prisma.import_items.findFirst({ where: { batch_id: batchId } });
    if (!item) throw new BadRequestException('Sem dados de extraÃ§Ã£o para este lote');

    let parsed: any;
    try { parsed = JSON.parse(item.record_data); } catch {
      throw new BadRequestException('Dados de extraÃ§Ã£o corrompidos');
    }

    const cnpj = parsed.cnpj_from_form;
    if (!cnpj) throw new BadRequestException('CNPJ nÃ£o encontrado nos dados extraÃ­dos');

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
  async streamBatchPdf(batchId: number, res: any) {
    const item = await this.prisma.import_items.findFirst({ where: { batch_id: batchId } });
    if (!item) throw new NotFoundException('Item não encontrado');

    let parsed: any;
    try { parsed = JSON.parse(item.record_data); } catch {
      throw new BadRequestException('Dados corrompidos');
    }

    const filePath: string | null = parsed.file_path ?? null;
    if (!filePath) throw new NotFoundException('Arquivo PDF não disponível para este lote');

    // Security: file must be inside the upload directory
    const uploadRoot = path.resolve(process.cwd(), 'upload');
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(uploadRoot)) {
      throw new BadRequestException('Acesso negado');
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new NotFoundException('Arquivo não encontrado no disco');
    }

    const stat = fs.statSync(resolvedPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(resolvedPath)}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(resolvedPath).pipe(res);
  }

  async discardBatch(batchId: number) {
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote nÃ£o encontrado');

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
        this.logger.warn(`Batch ${batchId}: nÃ£o foi possÃ­vel mover arquivo â€” ${e.message}`);
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
    if (!batch) throw new NotFoundException('Lote nÃ£o encontrado');
    if (!batch.company_id) {
      throw new BadRequestException('Empresa nÃ£o identificada neste lote â€” nÃ£o Ã© possÃ­vel aprovar');
    }

    const item = await this.prisma.import_items.findFirst({ where: { batch_id: batchId } });
    if (!item) throw new BadRequestException('Sem dados de extraÃ§Ã£o');

    let parsed: any;
    try { parsed = JSON.parse(item.record_data); } catch {
      throw new BadRequestException('Dados de extraÃ§Ã£o corrompidos');
    }

    const formData = parsed.form_data || parsed;
    const baseYear: number | undefined = formData?.fiscal_year;
    if (!baseYear || typeof baseYear !== 'number') {
      throw new BadRequestException('Ano fiscal nÃ£o identificado nos dados extraÃ­dos');
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
          tech_area_code: proj.tech_area_code ?? null,
          tech_area_label: proj.tech_area_label ?? null,
          start_date: proj.start_date ? new Date(proj.start_date) : null,
          end_date: proj.end_date ? new Date(proj.end_date) : null,
        },
      });

      for (const hr of proj.human_resources ?? []) {
        const rawCpf: string | null = hr.cpf?.replace(/\D/g, '') ?? null;
        const cpf = rawCpf && rawCpf.length > 0 ? hr.cpf : null; // store formatted as-is
        await (this.prisma as any).formpd_project_human_resources.create({
          data: {
            project_id: createdProj.id,
            name: hr.name || 'Desconhecido',
            cpf: cpf ?? null,
            role: hr.role ?? null,
            dedication_pct: hr.dedication_pct ?? null,
            annual_amount: hr.annual_amount ?? null,
          },
        });
      }

      for (const exp of proj.expenses ?? []) {
        // Skip aggregate-only entries — they have no independent category in the DB enum
        const upperCat: string = (exp.category ?? '').toUpperCase();
        if (upperCat === 'RECURSOS_HUMANOS' || upperCat === 'TOTAL_PROJETO') continue;

        const mappedCategory: string =
          AI_EXPENSE_CATEGORY_MAP[upperCat] ?? 'DESPESA_OPERACIONAL';

        await (this.prisma as any).formpd_project_expenses.create({
          data: {
            project_id: createdProj.id,
            expense_category: mappedCategory,
            description: exp.description ?? null,
            amount: exp.amount ?? 0,
          },
        });
      }

      // Equipment (bens do ativo utilizados no projeto)
      for (const eq of proj.equipment ?? []) {
        if (!eq?.description) continue;
        const origin = eq.origin === 'IMPORTADO' ? 'IMPORTADO' : 'NACIONAL';
        await (this.prisma as any).formpd_project_equipment.create({
          data: {
            project_id: createdProj.id,
            description: String(eq.description).substring(0, 500),
            origin,
            ncm_code: eq.ncm_code ?? null,
            quantity: eq.quantity ? Number(eq.quantity) : null,
            unit_amount: eq.unit_amount ?? 0,
            total_amount: eq.total_amount ?? null,
            acquisition_date: eq.acquisition_date ? new Date(eq.acquisition_date) : null,
            supplier_cnpj: eq.supplier_cnpj ?? null,
          },
        });
      }

      // Partners (instituições parceiras — ICT, universidades, cooperadoras)
      const VALID_PARTNER_TYPES = new Set([
        'EMPRESA_COOPERADORA', 'EMPRESA_COMPARTILHOU_CUSTOS',
        'UNIVERSIDADE_ICT', 'INVENTOR_INDEPENDENTE', 'MICRO_EPP',
      ]);
      for (const pt of proj.partners ?? []) {
        if (!pt?.name) continue;
        const partnerType = VALID_PARTNER_TYPES.has(pt.partner_type) ? pt.partner_type : 'EMPRESA_COOPERADORA';
        await (this.prisma as any).formpd_project_partners.create({
          data: {
            project_id: createdProj.id,
            name: String(pt.name).substring(0, 255),
            cnpj_cpf: pt.cnpj_cpf ?? null,
            partner_type: partnerType,
            role: pt.role ?? null,
            shared_amount: pt.shared_amount ?? null,
          },
        });
      }

      // Patents / PI (propriedade intelectual gerada pelo projeto)
      const VALID_ASSET_TYPES = new Set([
        'PATENTE', 'MODELO_UTILIDADE', 'DESENHO_INDUSTRIAL', 'MARCA', 'SOFTWARE', 'OUTRO_INTANGIVEL',
      ]);
      for (const pat of proj.patents ?? []) {
        if (!pat?.title) continue;
        const assetType = VALID_ASSET_TYPES.has(pat.asset_type) ? pat.asset_type : 'OUTRO_INTANGIVEL';
        await (this.prisma as any).formpd_project_patents.create({
          data: {
            project_id: createdProj.id,
            title: String(pat.title).substring(0, 500),
            asset_type: assetType,
            registration_number: pat.registration_number ?? null,
            registry_office: pat.registry_office ?? null,
            filing_date: pat.filing_date ? new Date(pat.filing_date) : null,
            grant_date: pat.grant_date ? new Date(pat.grant_date) : null,
            amount: pat.amount ?? null,
          },
        });
      }
    }

    // Representatives (signatários do formulário) — find or create contact, then link
    const VALID_PROFILE_TYPES = new Set(['REPRESENTANTE_CORPORATIVO', 'RESPONSAVEL_PREENCHIMENTO']);
    for (const rep of formData.representatives ?? []) {
      if (!rep?.name) continue;
      try {
        const cleanCpf = rep.cpf?.replace(/\D/g, '') || null;
        let contactId: number | null = null;

        // 1. Try to find existing contact by CPF (unique index)
        if (cleanCpf) {
          const existing = await this.prisma.contacts.findUnique({
            where: { cpf: rep.cpf },
            select: { id: true },
          });
          if (existing) contactId = existing.id;
        }

        // 2. If not found, create a minimal contact record
        if (!contactId) {
          const created = await this.prisma.contacts.create({
            data: {
              name: String(rep.name).substring(0, 255),
              cpf: rep.cpf ?? null,
              email: rep.email ?? null,
            },
          });
          contactId = created.id;
        }

        const profileType = VALID_PROFILE_TYPES.has(rep.profile_type)
          ? rep.profile_type
          : 'REPRESENTANTE_CORPORATIVO';

        await (this.prisma as any).formpd_form_representatives.upsert({
          where: { form_id_contact_id: { form_id: form.id, contact_id: contactId } },
          update: { profile_type: profileType, is_active: true },
          create: { form_id: form.id, contact_id: contactId, profile_type: profileType },
        });
      } catch (e: any) {
        this.logger.warn(`approveBatch: falha ao salvar representante "${rep.name}": ${e.message}`);
      }
    }

    // Upsert formpd_fiscal_incentives from fiscal_summary
    const fiscalSummary = formData.fiscal_summary;
    if (fiscalSummary) {
      await (this.prisma as any).formpd_fiscal_incentives.upsert({
        where: { form_id: form.id },
        update: {
          total_rnd_expenditure: fiscalSummary.total_rnd_expenditure ?? 0,
          total_benefit: fiscalSummary.total_benefit_requested ?? 0,
          ir_deduction_pct: fiscalSummary.ir_deduction_pct ?? null,
          updated_at: new Date(),
        },
        create: {
          form_id: form.id,
          total_rnd_expenditure: fiscalSummary.total_rnd_expenditure ?? 0,
          total_benefit: fiscalSummary.total_benefit_requested ?? 0,
          ir_deduction_pct: fiscalSummary.ir_deduction_pct ?? null,
        },
      });
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
    if (!batch) throw new NotFoundException('Lote nÃ£o encontrado');

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

  async getBatchTrace(batchId: number) {
    const batch = await this.prisma.import_batches.findUnique({
      where: { id: batchId },
    });
    if (!batch) throw new NotFoundException('Lote não encontrado');

    const itemStats = await this.prisma.import_items.groupBy({
      by: ['status'],
      where: { batch_id: batchId },
      _count: { id: true },
    });

    if (!batch.file_id) {
      return { batch, itemStats, file: null, intakes: [], jobs: [], events: [] };
    }

    const rawFile = await (this.prisma as any).files.findUnique({
      where: { id: batch.file_id },
      select: {
        id: true,
        sha256: true,
        mime_type: true,
        original_name: true,
        size_bytes: true,
        storage_key: true,
        created_at: true,
      },
    });

    const file = rawFile
      ? { ...rawFile, size_bytes: rawFile.size_bytes != null ? String(rawFile.size_bytes) : null }
      : null;

    const intakes = await (this.prisma as any).file_intakes.findMany({
      where: {
        file_id: batch.file_id,
        OR: [{ source_ref: `batch:${batchId}` }, { source_ref: null }],
      },
      orderBy: { received_at: 'asc' },
    });

    const intakeIds = intakes.map((i: any) => i.id);
    const jobs = await (this.prisma as any).file_jobs.findMany({
      where: {
        file_id: batch.file_id,
        ...(intakeIds.length > 0 ? { OR: [{ intake_id: { in: intakeIds } }, { intake_id: null }] } : {}),
      },
      orderBy: { created_at: 'asc' },
    });

    const events = await (this.prisma as any).file_events.findMany({
      where: { file_id: batch.file_id },
      orderBy: { event_at: 'asc' },
      take: 1000,
    });

    return { batch, itemStats, file, intakes, jobs, events };
  }

  async getFileJobTrace(fileJobId: string) {
    const job = await (this.prisma as any).file_jobs.findUnique({
      where: { id: fileJobId },
      include: {
        files: {
          select: {
            id: true,
            sha256: true,
            mime_type: true,
            original_name: true,
            storage_key: true,
            created_at: true,
          },
        },
        file_intakes: true,
      },
    });
    if (!job) throw new NotFoundException('Job de arquivo não encontrado');

    const [artifacts, events] = await Promise.all([
      (this.prisma as any).file_artifacts.findMany({
        where: { file_job_id: fileJobId },
        orderBy: { created_at: 'asc' },
      }),
      (this.prisma as any).file_events.findMany({
        where: { file_job_id: fileJobId },
        orderBy: { event_at: 'asc' },
      }),
    ]);

    return { job, artifacts, events };
  }

  async reprocessBatch(batchId: number) {
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote nÃ£o encontrado');

    const failedItems = await this.prisma.import_items.findMany({
      where: { batch_id: batchId, status: 'ERROR' }
    });

    if (failedItems.length === 0) {
      throw new BadRequestException('NÃ£o hÃ¡ itens com falha para reprocessar neste lote.');
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

