import { Processor, WorkerHost, OnWorkerEvent, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
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
    @InjectQueue('import-cnpjs') private readonly importCnpjsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { batchId, filePath } = job.data;
    this.logger.log(`Starting IA extraction for Batch ${batchId} (FORMP&D)`);

    try {
      await this.prisma.import_batches.update({
        where: { id: batchId },
        data: { status: 'PROCESSING' },
      });

      // 1. Ler o PDF e converter para Base64
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }
      const pdfBase64 = fs.readFileSync(filePath).toString('base64');

      // 2. Chamar o Motor de IA
      const iaResponse = await this.iaService.execute({
        task: 'FORMPD_EXTRACTION',
        content: pdfBase64,
        isPdfBase64: true,
      });

      const extractedData = iaResponse.data;

      // 3. Validar se o documento é realmente um FORMP&D
      const isValidFormpd = this.validateFormpdStructure(extractedData);
      if (!isValidFormpd) {
        this.logger.warn(`Batch ${batchId}: documento não é um FORMP&D válido`);
        await this.prisma.import_items.create({
          data: {
            batch_id: batchId,
            record_data: JSON.stringify({ raw: extractedData, is_valid_formpd: false }),
            status: 'INVALID_FORMPD',
            error_message: 'O documento enviado não foi reconhecido como um formulário FORMP&D válido.',
          },
        });
        await this.prisma.import_batches.update({
          where: { id: batchId },
          data: { status: 'ERROR', error_count: 1 },
        });
        this.notificationsGateway.sendFormpdCompleted({
          batchId,
          isValidFormpd: false,
          validationError: 'Documento não reconhecido como FORMP&D válido.',
          cnpjFromForm: null,
          companyId: null,
          companyName: null,
          companyRegistrationQueued: false,
        });
        return;
      }

      // 4. Extrair e normalizar CNPJ do documento
      const rawCnpj = extractedData?.company_info?.cnpj ?? '';
      const cnpjFromForm = rawCnpj.replace(/\D/g, '').padStart(14, '0') || null;

      // 5. Verificar se a empresa já está cadastrada
      let companyId: number | null = null;
      let companyName: string | null = null;
      let companyRegistrationQueued = false;

      if (cnpjFromForm) {
        const company = await this.prisma.companies.findUnique({
          where: { cnpj: cnpjFromForm },
          select: { id: true, legal_name: true },
        });

        if (company) {
          companyId = company.id;
          companyName = company.legal_name;
          this.logger.log(`Batch ${batchId}: empresa encontrada (id=${companyId}, cnpj=${cnpjFromForm})`);
        } else {
          // Empresa não cadastrada → enfileirar com ALTA prioridade (priority: 1)
          this.logger.log(`Batch ${batchId}: empresa não cadastrada para CNPJ ${cnpjFromForm} — enfileirando com ALTA prioridade`);

          // Criar import_batch para o CNPJ
          const cnpjBatch = await this.prisma.import_batches.create({
            data: {
              file_name: `auto-cnpj-formpd-${cnpjFromForm}`,
              entity_type: 'COMPANIES',
              status: 'PENDING',
              total_records: 1,
            },
          });

          const cnpjItem = await this.prisma.import_items.create({
            data: {
              batch_id: cnpjBatch.id,
              record_data: cnpjFromForm,
              status: 'PENDING',
            },
          });

          await this.importCnpjsQueue.add(
            'process-cnpj',
            { itemId: cnpjItem.id, batchId: cnpjBatch.id, cnpj: cnpjFromForm },
            { priority: 1, attempts: 3, backoff: { type: 'fixed', delay: 3000 } },
          );

          companyRegistrationQueued = true;
        }
      }

      // 6. Salvar na área de Staging (import_items)
      await this.prisma.import_items.create({
        data: {
          batch_id: batchId,
          record_data: JSON.stringify({
            form_data: extractedData,
            cnpj_from_form: cnpjFromForm,
            company_id: companyId,
            company_name: companyName,
            company_registration_queued: companyRegistrationQueued,
            is_valid_formpd: true,
          }),
          status: companyRegistrationQueued ? 'COMPANY_QUEUED' : 'PENDING',
          error_message: null,
        },
      });

      // 7. Finalizar o Lote
      await this.prisma.import_batches.update({
        where: { id: batchId },
        data: {
          status: 'COMPLETED',
          processed_records: 1,
          success_count: 1,
          updated_at: new Date(),
        },
      });

      // 8. Notificar frontend via WebSocket
      this.notificationsGateway.sendFormpdCompleted({
        batchId,
        isValidFormpd: true,
        cnpjFromForm,
        companyId,
        companyName,
        companyRegistrationQueued,
      });

      this.logger.log(`IA successfully processed Batch ${batchId} — CNPJ: ${cnpjFromForm}, company: ${companyId ?? 'queued'}`);

    } catch (error: any) {
      this.logger.error(`IA Extraction Failed for Batch ${batchId}: ${error.message}`);
      await this.prisma.import_batches.update({
        where: { id: batchId },
        data: { status: 'ERROR', error_count: 1 },
      });
      this.notificationsGateway.sendFormpdCompleted({
        batchId,
        isValidFormpd: false,
        validationError: error.message,
        cnpjFromForm: null,
        companyId: null,
        companyName: null,
        companyRegistrationQueued: false,
      });
      throw error;
    }
  }

  /**
   * Valida se o JSON extraído tem a estrutura mínima de um FORMP&D.
   * Critérios: fiscal_year numérico + ao menos 1 projeto + company_info com CNPJ.
   */
  private validateFormpdStructure(data: any): boolean {
    if (!data) return false;
    if (typeof data.fiscal_year !== 'number') return false;
    if (!Array.isArray(data.projects) || data.projects.length === 0) return false;
    if (!data.company_info?.cnpj) return false;
    return true;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`IA Job ${job.id} failed: ${error.message}`);
  }
}
