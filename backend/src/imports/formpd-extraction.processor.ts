import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { IaService } from '../ia/ia.service';
import { FileHubService } from '../file-hub/file-hub.service';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseLib = require('pdf-parse');

/** Max characters per AI call â€” ~20K tokens, leaves room for system prompt and output. */
const MAX_CHARS_PER_CHUNK = 80_000;

type ParsedPdfText = { text: string; numpages: number };

@Processor('formpd-extraction')
export class FormpdExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(FormpdExtractionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly iaService: IaService,
    private readonly fileHubService: FileHubService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { batchId, filePath, sourceCompanyId, fileHash, fileId, intakeId, fileJobId } = job.data;
    this.logger.log(`Starting IA extraction for Batch ${batchId} (FORMP&D) â€” sourceCompanyId=${sourceCompanyId ?? 'none'}`);

    try {
      await this.prisma.import_batches.update({
        where: { id: batchId },
        data: { status: 'PROCESSING' },
      });

      if (fileId && fileJobId) {
        await this.fileHubService.markJobStarted(fileId, fileJobId, intakeId ?? null);
      }

      // 1. Read and parse PDF
      if (!fs.existsSync(filePath)) throw new Error(`Arquivo nÃ£o encontrado: ${filePath}`);
      const pdfBuffer = fs.readFileSync(filePath);

      this.logger.log(`Batch ${batchId}: extraindo texto do PDF...`);
      const pdfData = await this.parsePdfText(pdfBuffer);
      const fullText = pdfData.text?.trim() ?? '';

      if (fullText.length < 100) {
        throw new Error(
          'NÃ£o foi possÃ­vel extrair texto legÃ­vel do PDF. ' +
          'Verifique se o documento nÃ£o estÃ¡ digitalizado como imagem.',
        );
      }

      this.logger.log(
        `Batch ${batchId}: ${fullText.length} chars (${pdfData.numpages} pÃ¡ginas). ` +
        `Modo: ${fullText.length <= MAX_CHARS_PER_CHUNK ? 'single-call' : 'chunked'}`,
      );

      const isChunked = fullText.length > MAX_CHARS_PER_CHUNK;
      const chunks = isChunked ? this.splitText(fullText, MAX_CHARS_PER_CHUNK) : [fullText];
      const totalSteps = chunks.length;

      await this.prisma.import_batches.update({
        where: { id: batchId },
        data: {
          total_records: totalSteps,
          processed_records: 0,
          success_count: 0,
          error_count: 0,
          status: 'PROCESSING',
          updated_at: new Date(),
        },
      });

      this.notificationsGateway.sendProgress({
        current: 0,
        total: totalSteps,
        message: `FORMP&D IA lote ${batchId}: iniciando extraÃ§Ã£o (${isChunked ? `${totalSteps} trechos` : 'documento Ãºnico'})`,
      });

      // 2. Extract via AI
      const extractedData = isChunked
        ? await this.extractChunked(chunks, batchId, fileId, fileJobId, intakeId)
        : await this.extractSingle(chunks[0], batchId, totalSteps, fileId, fileJobId, intakeId);

      // 3. Validate FORMPD structure
      if (!this.validateFormpdStructure(extractedData)) {
        this.logger.warn(`Batch ${batchId}: documento nÃ£o Ã© um FORMP&D vÃ¡lido`);
        await this.saveItemAndFinish(batchId, {
          raw: extractedData, is_valid_formpd: false, file_path: filePath, file_sha256: fileHash,
        }, 'INVALID_FORMPD', 'O documento enviado nÃ£o foi reconhecido como um formulÃ¡rio FORMP&D vÃ¡lido.');

        this.notificationsGateway.sendFormpdCompleted({
          batchId, status: 'INVALID_FORMPD',
          cnpjFromForm: null, companyId: null, companyName: null,
          errorMessage: 'Documento nÃ£o reconhecido como FORMP&D vÃ¡lido.',
        });
        await this.finalizeFileJobSuccess(fileId, fileJobId, intakeId, extractedData, 'INVALID_FORMPD');
        return;
      }

      // 4. Extract and normalize CNPJ from document
      const rawCnpj = extractedData?.company_info?.cnpj ?? '';
      const cnpjFromForm = rawCnpj.replace(/\D/g, '').padStart(14, '0') || null;

      // â”€â”€â”€ Flow A: Company-scoped upload (sourceCompanyId provided) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (sourceCompanyId) {
        const sourceCompany = await this.prisma.companies.findUnique({
          where: { id: sourceCompanyId },
          select: { id: true, cnpj: true, legal_name: true },
        });

        const sourceCleanCnpj = sourceCompany?.cnpj?.replace(/\D/g, '') ?? '';
        const cnpjMatches = !!cnpjFromForm && !!sourceCleanCnpj && cnpjFromForm === sourceCleanCnpj;

        if (!cnpjMatches) {
          this.logger.warn(
            `Batch ${batchId}: CNPJ mismatch â€” documento=${cnpjFromForm}, empresa=${sourceCleanCnpj}`,
          );
          this.moveFileToRejected(filePath);
          await this.saveItemAndFinish(batchId, {
            form_data: extractedData, cnpj_from_form: cnpjFromForm,
            company_id: sourceCompanyId, file_path: null, file_sha256: fileHash, is_valid_formpd: true,
          }, 'CNPJ_MISMATCH',
            `CNPJ do documento (${cnpjFromForm}) nÃ£o confere com a empresa (${sourceCleanCnpj}).`);

          this.notificationsGateway.sendFormpdCompleted({
            batchId, status: 'CNPJ_MISMATCH', cnpjFromForm,
            companyId: sourceCompanyId,
            companyName: sourceCompany?.legal_name ?? null,
            errorMessage: `CNPJ do documento nÃ£o confere com esta empresa.`,
          });
          await this.finalizeFileJobSuccess(fileId, fileJobId, intakeId, extractedData, 'CNPJ_MISMATCH');
          return;
        }

        // CNPJ matches â€” ready for review
        await this.prisma.import_batches.update({
          where: { id: batchId },
          data: { company_id: sourceCompanyId },
        });
        await this.saveItemAndFinish(batchId, {
          form_data: extractedData, cnpj_from_form: cnpjFromForm,
          company_id: sourceCompanyId, company_name: sourceCompany!.legal_name,
          file_path: filePath, file_sha256: fileHash, is_valid_formpd: true,
        }, 'PENDING_REVIEW', null);

        this.notificationsGateway.sendFormpdCompleted({
          batchId, status: 'PENDING_REVIEW', cnpjFromForm,
          companyId: sourceCompanyId, companyName: sourceCompany!.legal_name,
        });

        this.logger.log(`Batch ${batchId}: CNPJ validado â€” pronto para revisÃ£o (empresa id=${sourceCompanyId})`);
        await this.finalizeFileJobSuccess(fileId, fileJobId, intakeId, extractedData, 'PENDING_REVIEW');
        return;
      }

      // â”€â”€â”€ Flow B: Global upload (no sourceCompanyId) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          file_path: filePath, file_sha256: fileHash, is_valid_formpd: true,
        }, 'PENDING_REVIEW', null);

        this.notificationsGateway.sendFormpdCompleted({
          batchId, status: 'PENDING_REVIEW', cnpjFromForm, companyId, companyName,
        });
        this.logger.log(`Batch ${batchId}: empresa encontrada (id=${companyId}) â€” pronto para revisÃ£o`);
      } else {
        // Company not in the system â€” ask user
        await this.saveItemAndFinish(batchId, {
          form_data: extractedData, cnpj_from_form: cnpjFromForm,
          company_id: null, company_name: null,
          file_path: filePath, file_sha256: fileHash, is_valid_formpd: true,
        }, 'COMPANY_NOT_FOUND', null);

        this.notificationsGateway.sendFormpdCompleted({
          batchId, status: 'COMPANY_NOT_FOUND', cnpjFromForm,
          companyId: null, companyName: null,
        });
        this.logger.log(`Batch ${batchId}: empresa CNPJ=${cnpjFromForm} nÃ£o cadastrada â€” aguardando decisÃ£o do usuÃ¡rio`);
      }

      await this.finalizeFileJobSuccess(fileId, fileJobId, intakeId, extractedData, companyId ? 'PENDING_REVIEW' : 'COMPANY_NOT_FOUND');

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
      if (fileId && fileJobId) {
        await this.fileHubService.markJobFailed(fileId, fileJobId, error.message, intakeId ?? null);
      }
      throw error;
    }
  }

  /**
   * Supports both pdf-parse v1 (function export) and v2 (PDFParse class export).
   */
  private async finalizeFileJobSuccess(
    fileId: string | undefined,
    fileJobId: string | undefined,
    intakeId: string | undefined,
    extractedData: any,
    outcome: string,
  ) {
    if (!fileId || !fileJobId) return;

    await this.fileHubService.addArtifact(fileJobId, 'FORMPD_EXTRACTION_RESULT', {
      outcome,
      extractedData,
    });

    await this.fileHubService.markJobCompleted(fileId, fileJobId, intakeId ?? null, {
      outcome,
    });
  }
  private async parsePdfText(pdfBuffer: Buffer): Promise<ParsedPdfText> {
    // v1 style: const pdf = require('pdf-parse'); await pdf(buffer)
    const v1Fn = typeof pdfParseLib === 'function'
      ? pdfParseLib
      : (typeof pdfParseLib?.default === 'function' ? pdfParseLib.default : null);

    if (v1Fn) {
      const result = await v1Fn(pdfBuffer);
      return {
        text: result?.text ?? '',
        numpages: Number(result?.numpages ?? 0),
      };
    }

    // v2 style: const { PDFParse } = require('pdf-parse'); const p = new PDFParse({ data })
    const PDFParseCtor = pdfParseLib?.PDFParse ?? pdfParseLib?.default?.PDFParse;
    if (typeof PDFParseCtor === 'function') {
      const parser = new PDFParseCtor({ data: pdfBuffer });
      try {
        const result = await parser.getText();
        return {
          text: result?.text ?? '',
          numpages: Number(result?.total ?? result?.pages?.length ?? 0),
        };
      } finally {
        if (typeof parser.destroy === 'function') {
          await parser.destroy().catch(() => undefined);
        }
      }
    }

    throw new Error('Biblioteca pdf-parse incompatÃ­vel: export nÃ£o suportado');
  }

  // â”€â”€â”€ AI extraction helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async extractSingle(text: string, batchId: number, totalSteps: number, fileId?: string, fileJobId?: string, intakeId?: string): Promise<any> {
    this.logger.log(`Batch ${batchId}: processando trecho 1/${totalSteps}...`);
    const response = await this.iaService.execute({ task: 'FORMPD_EXTRACTION', content: text });
    await this.updateChunkProgress(batchId, 1, totalSteps, fileId, fileJobId, intakeId);
    return response.data;
  }

  private async extractChunked(chunks: string[], batchId: number, fileId?: string, fileJobId?: string, intakeId?: string): Promise<any> {
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
      await this.updateChunkProgress(batchId, i + 1, chunks.length, fileId, fileJobId, intakeId);
    }

    return this.mergeFormpdResults(results);
  }

  private async updateChunkProgress(batchId: number, current: number, total: number, fileId?: string, fileJobId?: string, intakeId?: string) {
    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: {
        processed_records: current,
        total_records: total,
        status: 'PROCESSING',
        updated_at: new Date(),
      },
    });

    if (fileId && fileJobId) {
      await this.fileHubService.markJobProgress(fileId, fileJobId, current, total, intakeId ?? null);
    }

    this.notificationsGateway.sendProgress({
      current,
      total,
      message: `FORMP&D IA lote ${batchId}: trecho ${current}/${total}`,
    });
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

    // Merge representatives — deduplicate by CPF, then by name
    const reprByCpf = new Map<string, any>();
    const reprByName = new Map<string, any>();
    for (const result of results) {
      for (const rep of result?.representatives ?? []) {
        if (!rep?.name) continue;
        const cpf = rep.cpf?.replace(/\D/g, '') || null;
        if (cpf && !reprByCpf.has(cpf)) { reprByCpf.set(cpf, rep); continue; }
        const nameKey = rep.name.trim().toLowerCase();
        if (!reprByName.has(nameKey)) reprByName.set(nameKey, rep);
      }
    }
    const representatives = [...reprByCpf.values(), ...reprByName.values()];

    // Merge projects — deduplicate by title, merge sub-arrays from multiple chunks
    const projByTitle = new Map<string, any>();
    for (const result of results) {
      for (const project of result?.projects ?? []) {
        if (!project?.title) continue;
        const key = project.title.trim().toLowerCase();
        if (!projByTitle.has(key)) {
          projByTitle.set(key, { ...project });
        } else {
          // Merge sub-arrays from subsequent chunks
          const existing = projByTitle.get(key);
          for (const field of ['human_resources', 'expenses', 'equipment', 'partners', 'patents'] as const) {
            if (Array.isArray(project[field]) && project[field].length > 0) {
              existing[field] = [...(existing[field] ?? []), ...project[field]];
            }
          }
        }
      }
    }

    return {
      company_info: withCompany?.company_info ?? null,
      fiscal_year: withCompany?.fiscal_year ?? null,
      fiscal_loss: withCompany?.fiscal_loss ?? false,
      fiscal_loss_amount: withCompany?.fiscal_loss_amount ?? null,
      representatives,
      projects: [...projByTitle.values()],
      fiscal_summary: withSummary?.fiscal_summary ?? null,
    };
  }

  // â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    const batch = await this.prisma.import_batches.findUnique({
      where: { id: batchId },
      select: { total_records: true },
    });
    const finalProcessed = Math.max(1, Number(batch?.total_records ?? 1));

    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: {
        status: batchStatus,
        processed_records: finalProcessed,
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
      this.logger.warn(`NÃ£o foi possÃ­vel mover arquivo para rejeitados: ${e.message}`);
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


