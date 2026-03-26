import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { FileHubService } from '../file-hub/file-hub.service';
import * as fs from 'fs';
import { parseFormpdDeterministic, DeterministicFormpdData } from './formpd-deterministic-parser';
const pdfParseLib = require('pdf-parse');

@Processor('formpd-deterministic', {
  lockDuration: 5 * 60 * 1000,  // 5 min is plenty for sync text extraction
  maxStalledCount: 1,
})
export class FormpdDeterministicProcessor extends WorkerHost {
  private readonly logger = new Logger(FormpdDeterministicProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly fileHubService: FileHubService,
  ) { super(); }

  async process(job: Job<any>): Promise<any> {
    const { batchId, filePath, sourceCompanyId, fileHash, fileId, intakeId, fileJobId } = job.data;
    this.logger.log(`Deterministic extraction for Batch ${batchId}`);

    try {
      await this.prisma.import_batches.update({ where: { id: batchId }, data: { status: 'PROCESSING' } });

      if (fileId && fileJobId) await this.fileHubService.markJobStarted(fileId, fileJobId, intakeId ?? null);

      if (!fs.existsSync(filePath)) throw new Error(`Arquivo não encontrado: ${filePath}`);
      const pdfBuffer = fs.readFileSync(filePath);

      // Extract text
      const pdfParsed = await this.parsePdfText(pdfBuffer);
      const text = pdfParsed.text?.trim() ?? '';
      if (text.length < 100) throw new Error('Não foi possível extrair texto do PDF.');

      // Run deterministic parser
      const detData = parseFormpdDeterministic(text);
      this.logger.log(`Batch ${batchId}: deterministic CNPJ=${detData.cnpj}, year=${detData.fiscal_year}, projects=${detData.projects.length}, confidence=${detData.confidence}`);

      // Validate: must at minimum find CNPJ and fiscal year
      if (!detData.cnpj || !detData.fiscal_year) {
        // Save as needing AI — fallback
        await this.saveAndNotify(batchId, { form_data: { company_info: { cnpj: null }, fiscal_year: null, projects: [] }, extraction_source: 'DETERMINISTIC_FAILED', file_path: filePath, file_sha256: fileHash }, 'NEEDS_AI_EXTRACTION', null, fileId, fileJobId, intakeId);
        return;
      }

      // Build form_data compatible with approveBatch format
      const formData = this.buildFormData(detData);

      // Company lookup
      const cnpjClean = detData.cnpj;
      let companyId: number | null = sourceCompanyId ?? null;
      let companyName: string | null = null;

      if (!companyId && cnpjClean) {
        const company = await this.prisma.companies.findUnique({ where: { cnpj: cnpjClean }, select: { id: true, legal_name: true } });
        if (company) { companyId = company.id; companyName = company.legal_name; }
      } else if (companyId) {
        const company = await this.prisma.companies.findUnique({ where: { id: companyId }, select: { id: true, legal_name: true, cnpj: true } });
        companyName = company?.legal_name ?? null;
        // CNPJ mismatch check
        const srcCnpj = company?.cnpj?.replace(/\D/g, '') ?? '';
        if (srcCnpj && cnpjClean !== srcCnpj) {
          await this.saveAndNotify(batchId, { form_data: formData, cnpj_from_form: cnpjClean, company_id: companyId, file_path: null, file_sha256: fileHash, is_valid_formpd: true }, 'CNPJ_MISMATCH', `CNPJ do documento (${cnpjClean}) não confere com a empresa (${srcCnpj}).`, fileId, fileJobId, intakeId);
          this.notificationsGateway.sendFormpdCompleted({ batchId, status: 'CNPJ_MISMATCH', cnpjFromForm: cnpjClean, companyId, companyName, errorMessage: 'CNPJ divergente.' });
          return;
        }
      }

      const status = companyId ? 'PENDING_REVIEW' : 'COMPANY_NOT_FOUND';
      if (companyId) {
        await this.prisma.import_batches.update({ where: { id: batchId }, data: { company_id: companyId } });
      }

      await this.saveAndNotify(batchId, {
        form_data: formData, cnpj_from_form: cnpjClean,
        company_id: companyId, company_name: companyName,
        file_path: filePath, file_sha256: fileHash, is_valid_formpd: true,
        extraction_source: 'DETERMINISTIC',
      }, status, null, fileId, fileJobId, intakeId);

      this.notificationsGateway.sendFormpdCompleted({ batchId, status, cnpjFromForm: cnpjClean, companyId, companyName });
      this.logger.log(`Batch ${batchId}: deterministic complete → ${status}`);

    } catch (error: any) {
      this.logger.error(`Deterministic failed for Batch ${batchId}: ${error.message}`);
      await this.prisma.import_batches.update({ where: { id: batchId }, data: { status: 'ERROR', error_count: 1 } });
      this.notificationsGateway.sendFormpdCompleted({ batchId, status: 'ERROR', cnpjFromForm: null, companyId: null, companyName: null, errorMessage: error.message });
      if (fileId && fileJobId) await this.fileHubService.markJobFailed(fileId, fileJobId, error.message, intakeId ?? null);
      throw error;
    }
  }

  private buildFormData(det: DeterministicFormpdData): any {
    return {
      company_info: { cnpj: det.cnpj, legal_name: det.legal_name },
      fiscal_year: det.fiscal_year,
      fiscal_loss: det.fiscal_loss ?? false,
      fiscal_loss_amount: det.fiscal_loss_amount ?? null,
      representatives: det.representatives,
      projects: det.projects.map(p => ({
        title: p.title,
        description: p.description ?? '',
        category: p.category ?? null,
        tech_area_code: null,
        tech_area_label: p.knowledge_area ?? null,
        is_continuous: p.is_continuous ?? false,
        start_date: p.start_date ?? null,
        end_date: p.end_date ?? null,
        item_number: p.item,
        keywords_1: p.keywords_1 ?? null,
        methodology: p.methodology ?? null,
        innovative_element: p.innovative_element ?? null,
        innovative_problem: p.innovative_problem ?? null,
        expected_result: p.expected_result ?? null,
        human_resources: [],
        expenses: [],
        equipment: [],
        partners: [],
        patents: [],
        extraction_source: 'DETERMINISTIC',
        total_amount: p.total_amount ?? null,
      })),
      fiscal_summary: {
        total_rnd_expenditure: det.total_rnd_expenditure ?? null,
        total_benefit_requested: det.total_incentives ?? null,
        ir_deduction_pct: null,
      },
    };
  }

  private async saveAndNotify(batchId: number, recordData: object, status: string, errorMessage: string | null, fileId?: string, fileJobId?: string, intakeId?: string) {
    await this.prisma.import_items.create({
      data: { batch_id: batchId, record_data: JSON.stringify(recordData), status, error_message: errorMessage },
    });
    const isError = ['CNPJ_MISMATCH', 'NEEDS_AI_EXTRACTION'].includes(status);
    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: { status: isError ? 'ERROR' : status, processed_records: 1, total_records: 1, success_count: isError ? 0 : 1, error_count: isError ? 1 : 0, updated_at: new Date() },
    });
    if (fileId && fileJobId) {
      await this.fileHubService.addArtifact(fileJobId, 'FORMPD_DETERMINISTIC_RESULT', { status, recordData });
      await this.fileHubService.markJobCompleted(fileId, fileJobId, intakeId ?? null, { status });
    }
  }

  private async parsePdfText(buf: Buffer): Promise<{ text: string; numpages: number }> {
    const v1 = typeof pdfParseLib === 'function' ? pdfParseLib : (typeof pdfParseLib?.default === 'function' ? pdfParseLib.default : null);
    if (v1) { const r = await v1(buf); return { text: r?.text ?? '', numpages: Number(r?.numpages ?? 0) }; }
    const Ctor = pdfParseLib?.PDFParse ?? pdfParseLib?.default?.PDFParse;
    if (typeof Ctor === 'function') {
      const p = new Ctor({ data: buf });
      try { const r = await p.getText(); return { text: r?.text ?? '', numpages: Number(r?.total ?? 0) }; }
      finally { if (typeof p.destroy === 'function') await p.destroy().catch(() => undefined); }
    }
    throw new Error('pdf-parse incompatível');
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) { this.logger.error(`Deterministic job ${job.id} failed: ${error.message}`); }
}
