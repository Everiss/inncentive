import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { IaService } from '../ia/ia.service';
import * as fs from 'fs';

@Processor('formpd-extraction')
export class FormpdExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(FormpdExtractionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly iaService: IaService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { batchId, filePath, companyId, baseYear } = job.data;
    this.logger.log(`Starting IA extraction for Batch ${batchId} (FORMP&D)`);

    // Buscar o CNPJ da empresa no banco para validação
    const company = await this.prisma.companies.findUnique({
      where: { id: companyId },
      select: { cnpj: true, legal_name: true },
    });

    try {
      await this.prisma.import_batches.update({
        where: { id: batchId },
        data: { status: 'PROCESSING' },
      });

      // 1. Ler o PDF local e converter para Base64
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }
      const pdfBuffer = fs.readFileSync(filePath);
      const pdfBase64 = pdfBuffer.toString('base64');

      // 2. Chamar o Motor de IA (IA)
      const iaResponse = await this.iaService.execute({
        task: 'FORMPD_EXTRACTION',
        content: pdfBase64,
        isPdfBase64: true,
        context: { baseYear }
      });

      const extractedData = iaResponse.data;

      // 3. Validar CNPJ: compara o CNPJ do documento com o da empresa
      const docCnpj = (extractedData?.company_info?.cnpj || '')
        .replace(/\D/g, '').trim();
      const companyCnpj = (company?.cnpj || '').replace(/\D/g, '').trim();
      const cnpjValid = docCnpj && companyCnpj && docCnpj === companyCnpj;
      const cnpjMismatch = docCnpj && companyCnpj && docCnpj !== companyCnpj;

      if (cnpjMismatch) {
        this.logger.warn(
          `CNPJ MISMATCH! Doc: ${docCnpj} vs Company (${companyId}): ${companyCnpj}`
        );
      }

      // 4. Salvar na área de Staging (import_items)
      await this.prisma.import_items.create({
        data: {
          batch_id: batchId,
          record_data: JSON.stringify(extractedData),
          // CNPJ_MISMATCH bloqueia aprovação manual na UI
          status: cnpjMismatch ? 'CNPJ_MISMATCH' : 'PENDING',
          error_message: cnpjMismatch
            ? `CNPJ divergente: documento contém ${docCnpj}, empresa cadastrada é ${companyCnpj}`
            : null,
        },
      });

      // 4. Finalizar o Lote
      await this.prisma.import_batches.update({
        where: { id: batchId },
        data: {
          status: 'COMPLETED',
          processed_records: 1,
          success_count: 1,
          updated_at: new Date(),
        },
      });

      this.notificationsGateway.sendCompleted({ 
        success: 1, 
        failed: 0, 
        total: 1,
      });

      this.logger.log(`IA successfully processed Batch ${batchId}`);

    } catch (error: any) {
      this.logger.error(`IA Extraction Failed for Batch ${batchId}: ${error.message}`);
      await this.prisma.import_batches.update({
        where: { id: batchId },
        data: { status: 'ERROR', error_count: 1 },
      });
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`IA Job ${job.id} failed: ${error.message}`);
  }
}
