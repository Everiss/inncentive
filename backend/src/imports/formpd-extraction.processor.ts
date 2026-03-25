import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { IaService } from '../ia/ia.service';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> = require('pdf-parse');

/** Max characters per AI call — ~20K tokens, leaves room for system prompt and output. */
const MAX_CHARS_PER_CHUNK = 80_000;

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
    const { batchId, filePath, sourceCompanyId } = job.data;
    this.logger.log(`Starting IA extraction for Batch ${batchId} (FORMP&D) — sourceCompanyId=${sourceCompanyId ?? 'none'}`);

    try {
      await this.prisma.import_batches.update({
        where: { id: batchId },
        data: { status: 'PROCESSING' },
      });

      // 1. Read and parse PDF
      if (!fs.existsSync(filePath)) throw new Error(`Arquivo não encontrado: ${filePath}`);
      const pdfBuffer = fs.readFileSync(filePath);

      this.logger.log(`Batch ${batchId}: extraindo texto do PDF...`);
      const pdfData = await pdfParse(pdfBuffer);
      const fullText = pdfData.text?.trim() ?? '';

      if (fullText.length < 100) {
        throw new Error(
          'Não foi possível extrair texto legível do PDF. ' +
          'Verifique se o documento não está digitalizado como imagem.',
        );
      }

      this.logger.log(
        `Batch ${batchId}: ${fullText.length} chars (${pdfData.numpages} páginas). ` +
        `Modo: ${fullText.length <= MAX_CHARS_PER_CHUNK ? 'single-call' : 'chunked'}`,
      );

      // 2. Extract via AI
      const extractedData = fullText.length <= MAX_CHARS_PER_CHUNK
        ? await this.extractSingle(fullText)
        : await this.extractChunked(fullText, batchId);

      // 3. Validate FORMPD structure
      if (!this.validateFormpdStructure(extractedData)) {
        this.logger.warn(`Batch ${batchId}: documento não é um FORMP&D válido`);
        await this.saveItemAndFinish(batchId, {
          raw: extractedData, is_valid_formpd: false, file_path: filePath,
        }, 'INVALID_FORMPD', 'O documento enviado não foi reconhecido como um formulário FORMP&D válido.');

        this.notificationsGateway.sendFormpdCompleted({
          batchId, status: 'INVALID_FORMPD',
          cnpjFromForm: null, companyId: null, companyName: null,
          errorMessage: 'Documento não reconhecido como FORMP&D válido.',
        });
        return;
      }

      // 4. Extract and normalize CNPJ from document
      const rawCnpj = extractedData?.company_info?.cnpj ?? '';
      const cnpjFromForm = rawCnpj.replace(/\D/g, '').padStart(14, '0') || null;

      // ─── Flow A: Company-scoped upload (sourceCompanyId provided) ───────────
      if (sourceCompanyId) {
        const sourceCompany = await this.prisma.companies.findUnique({
          where: { id: sourceCompanyId },
          select: { id: true, cnpj: true, legal_name: true },
        });

        const sourceCleanCnpj = sourceCompany?.cnpj?.replace(/\D/g, '') ?? '';
        const cnpjMatches = !!cnpjFromForm && !!sourceCleanCnpj && cnpjFromForm === sourceCleanCnpj;

        if (!cnpjMatches) {
          this.logger.warn(
            `Batch ${batchId}: CNPJ mismatch — documento=${cnpjFromForm}, empresa=${sourceCleanCnpj}`,
          );
          this.moveFileToRejected(filePath);
          await this.saveItemAndFinish(batchId, {
            form_data: extractedData, cnpj_from_form: cnpjFromForm,
            company_id: sourceCompanyId, file_path: null, is_valid_formpd: true,
          }, 'CNPJ_MISMATCH',
            `CNPJ do documento (${cnpjFromForm}) não confere com a empresa (${sourceCleanCnpj}).`);

          this.notificationsGateway.sendFormpdCompleted({
            batchId, status: 'CNPJ_MISMATCH', cnpjFromForm,
            companyId: sourceCompanyId,
            companyName: sourceCompany?.legal_name ?? null,
            errorMessage: `CNPJ do documento não confere com esta empresa.`,
          });
          return;
        }

        // CNPJ matches — ready for review
        await this.prisma.import_batches.update({
          where: { id: batchId },
          data: { company_id: sourceCompanyId },
        });
        await this.saveItemAndFinish(batchId, {
          form_data: extractedData, cnpj_from_form: cnpjFromForm,
          company_id: sourceCompanyId, company_name: sourceCompany!.legal_name,
          file_path: filePath, is_valid_formpd: true,
        }, 'PENDING_REVIEW', null);

        this.notificationsGateway.sendFormpdCompleted({
          batchId, status: 'PENDING_REVIEW', cnpjFromForm,
          companyId: sourceCompanyId, companyName: sourceCompany!.legal_name,
        });

        this.logger.log(`Batch ${batchId}: CNPJ validado — pronto para revisão (empresa id=${sourceCompanyId})`);
        return;
      }

      // ─── Flow B: Global upload (no sourceCompanyId) ──────────────────────────
      let companyId: number | null = null;
      let companyName: string | null = null;

      if (cnpjFromForm) {
        const company = await this.prisma.companies.findUnique({
          where: { cnpj: cnpjFromForm },
          select: { id: true, legal_name: true },
        });
        if (company) {
          companyId = company.id;
          companyName = company.legal_name;
        }
      }

      if (companyId) {
        await this.prisma.import_batches.update({
          where: { id: batchId },
          data: { company_id: companyId },
        });
        await this.saveItemAndFinish(batchId, {
          form_data: extractedData, cnpj_from_form: cnpjFromForm,
          company_id: companyId, company_name: companyName,
          file_path: filePath, is_valid_formpd: true,
        }, 'PENDING_REVIEW', null);

        this.notificationsGateway.sendFormpdCompleted({
          batchId, status: 'PENDING_REVIEW', cnpjFromForm, companyId, companyName,
        });
        this.logger.log(`Batch ${batchId}: empresa encontrada (id=${companyId}) — pronto para revisão`);
      } else {
        // Company not in the system — ask user
        await this.saveItemAndFinish(batchId, {
          form_data: extractedData, cnpj_from_form: cnpjFromForm,
          company_id: null, company_name: null,
          file_path: filePath, is_valid_formpd: true,
        }, 'COMPANY_NOT_FOUND', null);

        this.notificationsGateway.sendFormpdCompleted({
          batchId, status: 'COMPANY_NOT_FOUND', cnpjFromForm,
          companyId: null, companyName: null,
        });
        this.logger.log(`Batch ${batchId}: empresa CNPJ=${cnpjFromForm} não cadastrada — aguardando decisão do usuário`);
      }

    } catch (error: any) {
      this.logger.error(`IA Extraction Failed for Batch ${batchId}: ${error.message}`);
      await this.prisma.import_batches.update({
        where: { id: batchId },
        data: { status: 'ERROR', error_count: 1 },
      });
      this.notificationsGateway.sendFormpdCompleted({
        batchId, status: 'ERROR',
        cnpjFromForm: null, companyId: null, companyName: null,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  // ─── AI extraction helpers ──────────────────────────────────────────────────

  private async extractSingle(text: string): Promise<any> {
    const response = await this.iaService.execute({ task: 'FORMPD_EXTRACTION', content: text });
    return response.data;
  }

  private async extractChunked(text: string, batchId: number): Promise<any> {
    const chunks = this.splitText(text, MAX_CHARS_PER_CHUNK);
    this.logger.log(`Batch ${batchId}: documento dividido em ${chunks.length} trechos`);

    const results: any[] = [];
    for (let i = 0; i < chunks.length; i++) {
      this.logger.log(`Batch ${batchId}: processando trecho ${i + 1}/${chunks.length}...`);
      const response = await this.iaService.execute({
        task: 'FORMPD_EXTRACTION',
        content: chunks[i],
        chunkContext: { index: i, total: chunks.length },
      });
      results.push(response.data);
    }

    return this.mergeFormpdResults(results);
  }

  private splitText(text: string, maxChars: number): string[] {
    if (text.length <= maxChars) return [text];

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + maxChars, text.length);

      if (end < text.length) {
        const searchFrom = start + Math.floor(maxChars * 0.8);
        const boundary = text.lastIndexOf('\n\n', end);
        if (boundary > searchFrom) end = boundary + 2;
        else {
          const nl = text.lastIndexOf('\n', end);
          if (nl > searchFrom) end = nl + 1;
        }
      }

      chunks.push(text.slice(start, end).trim());
      start = end;
    }

    return chunks.filter(c => c.length > 0);
  }

  private mergeFormpdResults(results: any[]): any {
    const withCompany = results.find(r => r?.company_info?.cnpj) ?? results[0];
    const withSummary = [...results].reverse().find(r => r?.fiscal_summary) ?? results[results.length - 1];

    const seen = new Set<string>();
    const projects: any[] = [];
    for (const result of results) {
      for (const project of result?.projects ?? []) {
        if (!project?.title) continue;
        const key = project.title.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          projects.push(project);
        }
      }
    }

    return {
      company_info: withCompany?.company_info ?? null,
      fiscal_year: withCompany?.fiscal_year ?? null,
      fiscal_loss: withCompany?.fiscal_loss ?? false,
      fiscal_loss_amount: withCompany?.fiscal_loss_amount ?? null,
      projects,
      fiscal_summary: withSummary?.fiscal_summary ?? null,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async saveItemAndFinish(
    batchId: number,
    recordData: object,
    status: string,
    errorMessage: string | null,
  ) {
    await this.prisma.import_items.create({
      data: {
        batch_id: batchId,
        record_data: JSON.stringify(recordData),
        status,
        error_message: errorMessage,
      },
    });

    const isError = status === 'INVALID_FORMPD' || status === 'CNPJ_MISMATCH';
    const batchStatus = isError ? 'ERROR' : status; // PENDING_REVIEW, COMPANY_NOT_FOUND, or ERROR

    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: {
        status: batchStatus,
        processed_records: 1,
        success_count: isError ? 0 : 1,
        error_count: isError ? 1 : 0,
        updated_at: new Date(),
      },
    });
  }

  private moveFileToRejected(filePath: string) {
    try {
      if (!filePath || !fs.existsSync(filePath)) return;
      const rejectedDir = path.join(process.cwd(), 'upload', 'rejected', 'FORM');
      fs.mkdirSync(rejectedDir, { recursive: true });
      const dest = path.join(rejectedDir, path.basename(filePath));
      fs.renameSync(filePath, dest);
      this.logger.log(`Arquivo movido para rejeitados: ${dest}`);
    } catch (e: any) {
      this.logger.warn(`Não foi possível mover arquivo para rejeitados: ${e.message}`);
    }
  }

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
