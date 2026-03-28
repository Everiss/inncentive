import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AxiosError } from 'axios';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { FileHubClientService } from '../integrations/file-hub/client';
import { ImportServiceClient } from '../integrations/import-service/client';
import { NotificationServiceClient } from '../integrations/notification-service/client';
import { PdfExtractorClient } from '../integrations/pdf-extractor/client';
import { ReceitaWsClient } from '../integrations/receita-ws/client';

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly importServiceClient: ImportServiceClient,
    private readonly fileHubClientService: FileHubClientService,
    private readonly notificationServiceClient: NotificationServiceClient,
    private readonly pdfExtractorClient: PdfExtractorClient,
    private readonly receitaWsClient: ReceitaWsClient,
  ) {}

  private readonly formEntityType = 'FORMPD_AI_EXTRACTION';

  private normalizeCnpj(raw?: string | null): string | null {
    if (!raw) return null;
    const digits = String(raw).replace(/\D/g, '');
    if (!digits) return null;
    return digits.padStart(14, '0');
  }

  private sanitizeFileName(raw?: string | null): string {
    const base = String(raw || 'arquivo.pdf').trim();
    const sanitized = base.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
    if (!sanitized) return 'arquivo.pdf';
    return sanitized.toLowerCase().endsWith('.pdf') ? sanitized : `${sanitized}.pdf`;
  }

  private parseBrCurrency(raw: unknown): number | null {
    if (raw === null || raw === undefined) return null;
    const text = String(raw).trim();
    if (!text) return null;
    const only = text.replace(/[^\d,.-]/g, '');
    if (!only) return null;
    const normalized = only.includes(',')
      ? only.replace(/\./g, '').replace(',', '.')
      : only;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  private parseLooseInt(raw: unknown): number | null {
    if (raw === null || raw === undefined) return null;
    const digits = String(raw).replace(/\D/g, '');
    if (!digits) return null;
    const value = Number(digits);
    return Number.isFinite(value) ? value : null;
  }

  private parseLooseBool(raw: unknown): boolean | null {
    if (raw === null || raw === undefined) return null;
    const t = String(raw).trim().toLowerCase();
    if (!t) return null;
    if (['sim', 'yes', 'true', '1'].includes(t)) return true;
    if (['nao', 'não', 'no', 'false', '0'].includes(t)) return false;
    return null;
  }

  private parseDateLoose(raw: unknown): Date | null {
    if (raw === null || raw === undefined) return null;
    const text = String(raw).trim();
    if (!text) return null;

    const iso = new Date(text);
    if (!Number.isNaN(iso.getTime())) return iso;

    const dmy = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) {
      const d = Number(dmy[1]);
      const m = Number(dmy[2]);
      const y = Number(dmy[3]);
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (!Number.isNaN(dt.getTime())) return dt;
    }

    const yearOnly = text.match(/\b(20\d{2})\b/);
    if (yearOnly) {
      const y = Number(yearOnly[1]);
      const dt = new Date(Date.UTC(y, 0, 1));
      if (!Number.isNaN(dt.getTime())) return dt;
    }
    return null;
  }

  private parsePbPaOrDe(raw: unknown): number | null {
    if (raw === null || raw === undefined) return null;
    const t = String(raw).toUpperCase();
    if (t.includes('PESQUISA_BASICA') || /\bPB\b/.test(t)) return 1;
    if (t.includes('PESQUISA_APLICADA') || /\bPA\b/.test(t)) return 2;
    if (t.includes('DESENVOLVIMENTO_EXPERIMENTAL') || /\bDE\b/.test(t)) return 3;
    return null;
  }

  private mapExpenseCategory(raw: unknown):
    | 'SERVICO_APOIO_PF'
    | 'SERVICO_APOIO_PJ'
    | 'MATERIAL_CONSUMO'
    | 'TIB'
    | 'DESPESA_OPERACIONAL'
    | null {
    if (raw === null || raw === undefined) return null;
    const t = String(raw).toLowerCase();
    if (!t.trim()) return null;
    if (t.includes('material')) return 'MATERIAL_CONSUMO';
    if (t.includes('tecnologia industrial') || t.includes('tib')) return 'TIB';
    if (t.includes('pessoa jur') || t.includes('terceiros contratad')) return 'SERVICO_APOIO_PJ';
    if (t.includes('apoio tecnico') || t.includes('servico de apoio')) return 'SERVICO_APOIO_PF';
    if (t.includes('servicos de terceiros')) return 'DESPESA_OPERACIONAL';
    return 'DESPESA_OPERACIONAL';
  }

  private safeJsonParse<T = any>(value: string | null | undefined, fallback: T): T {
    try {
      return value ? (JSON.parse(value) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private mapBatch(batch: any) {
    return {
      ...batch,
      file_name: batch.file_name ?? batch.source_filename ?? null,
      entity_type: batch.entity_type ?? null,
      total_records: Number(batch.total_records ?? batch.total_rows ?? 0),
      processed_records: Number(batch.processed_records ?? batch.processed_rows ?? 0),
      success_count: Number(batch.success_count ?? batch.success_rows ?? 0),
      error_count: Number(batch.error_count ?? batch.error_rows ?? 0),
    };
  }

  private isNumericId(id: string): boolean {
    return /^\d+$/.test(String(id || '').trim());
  }

  private async findFormBatchById(id: string) {
    if (!this.isNumericId(id)) return null;
    return this.prisma.import_batches.findUnique({
      where: { id: Number(id) },
      include: { company: true },
    });
  }

  private async readFirstBatchItem(batchId: number) {
    return this.prisma.import_items.findFirst({
      where: { batch_id: batchId },
      orderBy: { id: 'asc' },
    });
  }

  private async persistFormBatch(input: {
    fileName: string;
    fileId: string;
    companyId: number | null;
    status: string;
    itemStatus: string;
    payload: Record<string, unknown>;
    errorMessage?: string | null;
  }) {
    const batch = await this.prisma.import_batches.create({
      data: {
        entity_type: this.formEntityType,
        file_name: input.fileName,
        status: input.status,
        total_records: 1,
        processed_records: 1,
        success_count: input.itemStatus === 'ERROR' ? 0 : 1,
        error_count: input.itemStatus === 'ERROR' ? 1 : 0,
        company_id: input.companyId,
        file_id: input.fileId,
      },
    });

    await this.prisma.import_items.create({
      data: {
        batch_id: batch.id,
        record_data: JSON.stringify(input.payload),
        status: input.itemStatus,
        error_message: input.errorMessage ?? null,
      },
    });

    return batch;
  }

  private async updateBatchItemPayload(batchId: number, updater: (payload: any) => any, status?: string) {
    const item = await this.readFirstBatchItem(batchId);
    if (!item) throw new NotFoundException('Item do lote nao encontrado');

    const parsed = this.safeJsonParse<any>(item.record_data, {});
    const updated = updater(parsed);

    await this.prisma.import_items.update({
      where: { id: item.id },
      data: {
        record_data: JSON.stringify(updated),
        ...(status ? { status } : {}),
        updated_at: new Date(),
      },
    });
    return updated;
  }

  private buildDefaultTemplate(legacyType: 'COMPANIES' | 'CONTACTS' | 'COLLABORATORS' | 'PROJECTS') {
    if (legacyType === 'COMPANIES') {
      return {
        code: 'companies_basic_v1',
        name: 'Companies Basic v1',
        entityType: 'COMPANIES',
        fileType: 'ANY',
        headerRow: 0,
        columnMap: {
          cnpj: 'cnpj',
          CNPJ: 'cnpj',
          'Razao Social': 'legal_name',
          'Nome Fantasia': 'trade_name',
          Email: 'email',
          email: 'email',
        },
        isActive: true,
      };
    }

    if (legacyType === 'CONTACTS') {
      return {
        code: 'contacts_basic_v1',
        name: 'Contacts Basic v1',
        entityType: 'CONTACTS',
        fileType: 'ANY',
        headerRow: 0,
        columnMap: {
          Nome: 'name',
          nome: 'name',
          Email: 'email',
          email: 'email',
          Telefone: 'phone',
          telefone: 'phone',
          CPF: 'cpf',
          cpf: 'cpf',
          CNPJ: 'cnpj',
          cnpj: 'cnpj',
        },
        isActive: true,
      };
    }

    if (legacyType === 'COLLABORATORS') {
      return {
        code: 'collaborators_basic_v1',
        name: 'Collaborators Basic v1',
        entityType: 'COLLABORATORS',
        fileType: 'ANY',
        headerRow: 0,
        columnMap: {
          Nome: 'name',
          nome: 'name',
          Email: 'email',
          email: 'email',
          Telefone: 'phone',
          telefone: 'phone',
          Cargo: 'role',
          cargo: 'role',
          Matricula: 'registration',
          matricula: 'registration',
          Usuario: 'username',
          usuario: 'username',
          CNPJ: 'cnpj',
          cnpj: 'cnpj',
        },
        isActive: true,
      };
    }

    return {
      code: 'projects_basic_v1',
      name: 'Projects Basic v1',
      entityType: 'PROJECTS',
      fileType: 'ANY',
      headerRow: 0,
      columnMap: {
        Nome: 'name',
        nome: 'name',
        Descricao: 'description',
        descricao: 'description',
        'Data Inicio': 'start_date',
        data_inicio: 'start_date',
        CNPJ: 'cnpj',
        cnpj: 'cnpj',
      },
      isActive: true,
    };
  }

  private async performUpload(templateCode: string, file: Express.Multer.File) {
    return this.importServiceClient.upload(templateCode, file);
  }

  private async ensureTemplateExists(legacyType: 'COMPANIES' | 'CONTACTS' | 'COLLABORATORS' | 'PROJECTS') {
    const payload = this.buildDefaultTemplate(legacyType);
    try {
      await this.importServiceClient.createTemplate(payload);
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status && [400, 409].includes(error.response.status)) {
        return;
      }
      throw error;
    }
  }

  async getTemplates() {
    return this.importServiceClient.getTemplates();
  }

  async createTemplate(payload: any) {
    return this.importServiceClient.createTemplate(payload);
  }

  async upload(templateCode: string, file: Express.Multer.File) {
    return this.performUpload(templateCode, file);
  }

  async uploadLegacy(
    legacyType: 'COMPANIES' | 'CONTACTS' | 'COLLABORATORS' | 'PROJECTS',
    file: Express.Multer.File,
  ) {
    const templateCode = this.buildDefaultTemplate(legacyType).code;

    try {
      const data = await this.performUpload(templateCode, file);
      return {
        ...data,
        message: 'Lote criado com sucesso!',
      };
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        await this.ensureTemplateExists(legacyType);
        const data = await this.performUpload(templateCode, file);
        return {
          ...data,
          message: 'Lote criado com sucesso!',
        };
      }
      throw error;
    }
  }

  async uploadFormpd(file: Express.Multer.File, sourceCompanyId?: number) {
    if (!file) throw new BadRequestException('Arquivo nao enviado');
    if (!file.originalname.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException('Apenas PDF e aceito para FORMP&D');
    }

    const uploadRoot = path.resolve(process.cwd(), '..', 'upload', 'pending', 'FORM');
    fs.mkdirSync(uploadRoot, { recursive: true });
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = path.join(uploadRoot, `${Date.now()}-${safeName}`);
    fs.writeFileSync(storagePath, file.buffer);

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const intake = await this.fileHubClientService.registerUploadIntake({
      filePath: storagePath,
      originalName: file.originalname,
      mimeType: file.mimetype || 'application/pdf',
      sizeBytes: file.size,
      companyId: sourceCompanyId ?? null,
      source: 'FORMS_MODAL',
      sourceRef: `forms:${Date.now()}`,
      hash: sha256,
    });
    const job = await this.fileHubClientService.createProcessingJob({
      fileId: intake.fileId,
      intakeId: intake.intakeId,
      jobType: 'FORMPD_EXTRACTION',
      processor: 'PDF_EXTRACTOR',
      processorVersion: 'v1',
      priority: 3,
      idempotencyKey: `${intake.fileId}:FORMPD_EXTRACTOR:v1`,
    });

    await this.fileHubClientService.markJobStarted(intake.fileId, job.id, intake.intakeId);

    try {
      const extraction = await this.pdfExtractorClient.extract(file);
      await this.fileHubClientService.markJobProgress(intake.fileId, job.id, 1, 1, intake.intakeId);
      await this.fileHubClientService.addArtifact(job.id, 'FORMPD_DETERMINISTIC_JSON', extraction, 1);

      const normalizedCnpj = this.normalizeCnpj(extraction.cnpj_from_form);
      const extractedCompany = normalizedCnpj
        ? await this.prisma.companies.findUnique({ where: { cnpj: normalizedCnpj } })
        : null;

      const effectiveCompanyId = sourceCompanyId ?? extractedCompany?.id ?? null;
      let status = 'PENDING_REVIEW';
      if (!extraction.is_valid_formpd) status = 'INVALID_FORMPD';
      else if (!effectiveCompanyId) status = 'COMPANY_NOT_FOUND';

      const payload = {
        ...extraction,
        cnpj_from_form: normalizedCnpj,
        company_id: effectiveCompanyId,
        company_name: extractedCompany?.legal_name ?? extraction.company_name ?? null,
        file_id: intake.fileId,
        intake_id: intake.intakeId,
        file_job_id: job.id,
      };

      const batch = await this.persistFormBatch({
        fileName: file.originalname,
        fileId: intake.fileId,
        companyId: effectiveCompanyId,
        status,
        itemStatus: status === 'INVALID_FORMPD' ? 'ERROR' : 'PENDING_REVIEW',
        payload,
        errorMessage: status === 'INVALID_FORMPD' ? 'Documento nao reconhecido como FORMP&D valido' : null,
      });

      await this.prisma.import_items.updateMany({
        where: { batch_id: batch.id },
        data: { file_job_id: job.id },
      });

      // Auto-enqueue AI when score is LOW (< 60%) and company is known
      if (status === 'PENDING_REVIEW') {
        const qualityScore = (extraction?.meta?.quality_policy as any)?.score as Record<string, any> | undefined;
        const scoreBand: string | undefined = qualityScore?.score_band;
        const aiPriorityFields: string[] = Array.isArray(qualityScore?.ai_priority_fields) ? qualityScore.ai_priority_fields : [];
        if (scoreBand === 'LOW') {
          await this.enqueueAi(String(batch.id), { fields: aiPriorityFields });
        }
      }

      await this.fileHubClientService.markJobCompleted(intake.fileId, job.id, intake.intakeId, {
        batchId: batch.id,
        status,
      });

      await this.notificationServiceClient.publish('formpd:completed', {
        batchId: batch.id,
        status,
        cnpjFromForm: normalizedCnpj,
        companyId: effectiveCompanyId,
        companyName: extractedCompany?.legal_name ?? extraction.company_name ?? null,
      });

      return {
        success: true,
        batchId: batch.id,
        status,
        companyId: effectiveCompanyId,
        cnpjFromForm: normalizedCnpj,
      };
    } catch (error: any) {
      await this.fileHubClientService.markJobFailed(intake.fileId, job.id, error.message, intake.intakeId);

      const batch = await this.persistFormBatch({
        fileName: file.originalname,
        fileId: intake.fileId,
        companyId: sourceCompanyId ?? null,
        status: 'ERROR',
        itemStatus: 'ERROR',
        payload: {
          file_id: intake.fileId,
          intake_id: intake.intakeId,
          file_job_id: job.id,
          error_message: error.message,
        },
        errorMessage: error.message,
      });

      await this.notificationServiceClient.publish('formpd:completed', {
        batchId: batch.id,
        status: 'ERROR',
        cnpjFromForm: null,
        companyId: null,
        companyName: null,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  async registerFormpdCompany(batchIdRaw: string) {
    const batchId = Number(batchIdRaw);
    if (!Number.isFinite(batchId)) throw new BadRequestException('Batch invalido');

    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch || batch.entity_type !== this.formEntityType) {
      throw new NotFoundException('Lote FORMP&D nao encontrado');
    }

    const item = await this.readFirstBatchItem(batch.id);
    if (!item) throw new NotFoundException('Item do lote nao encontrado');
    const parsed = this.safeJsonParse<any>(item.record_data, {});

    const cnpj = this.normalizeCnpj(parsed.cnpj_from_form);
    if (!cnpj) throw new BadRequestException('CNPJ nao identificado no formulario');

    let company = await this.prisma.companies.findUnique({ where: { cnpj } });
    if (!company) {
      const receitaData = await this.receitaWsClient.fetchCnpj(cnpj);
      if (receitaData?.status === 'ERROR') {
        throw new BadRequestException(receitaData?.message || 'ReceitaWS nao encontrou o CNPJ');
      }

      company = await this.prisma.companies.create({
        data: {
          cnpj,
          legal_name: receitaData?.nome || parsed.company_name || `Empresa ${cnpj}`,
          trade_name: receitaData?.fantasia || null,
          email: receitaData?.email || null,
          status: 'OK',
          updated_at: new Date(),
        },
      });
    }

    await this.prisma.import_batches.update({
      where: { id: batch.id },
      data: { company_id: company.id, status: 'PENDING_REVIEW', updated_at: new Date() },
    });

    await this.updateBatchItemPayload(
      batch.id,
      (p) => ({
        ...p,
        company_id: company.id,
        company_name: company.legal_name,
      }),
      'PENDING_REVIEW',
    );

    await this.notificationServiceClient.publish('formpd:company-registered', {
      batchId: batch.id,
      companyId: company.id,
      companyName: company.legal_name,
      cnpj,
    });

    return { success: true, batchId: batch.id, companyId: company.id };
  }

  async approveFormpdBatch(batchIdRaw: string) {
    const batchId = Number(batchIdRaw);
    if (!Number.isFinite(batchId)) throw new BadRequestException('Batch invalido');

    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch || batch.entity_type !== this.formEntityType) {
      throw new NotFoundException('Lote FORMP&D nao encontrado');
    }
    if (!batch.company_id) throw new BadRequestException('Empresa nao vinculada ao lote');

    const item = await this.readFirstBatchItem(batch.id);
    if (!item) throw new NotFoundException('Item do lote nao encontrado');
    const parsed = this.safeJsonParse<any>(item.record_data, {});
    const formData = parsed.form_data || {};
    const fiscalYear = Number(formData.fiscal_year || parsed.fiscal_year || new Date().getFullYear() - 1);
    const company = await this.prisma.companies.findUnique({
      where: { id: batch.company_id },
      select: { id: true, cnpj: true },
    });
    if (!company?.cnpj) throw new BadRequestException('Empresa sem CNPJ para organizar o storage do arquivo');

    const form = await this.prisma.formpd_forms.upsert({
      where: {
        company_id_base_year: {
          company_id: batch.company_id,
          base_year: fiscalYear,
        },
      },
      update: {
        status: 'EM_PREENCHIMENTO',
        updated_at: new Date(),
      },
      create: {
        company_id: batch.company_id,
        base_year: fiscalYear,
        status: 'EM_PREENCHIMENTO',
      },
    });

    if (batch.file_id) {
      const cnpjFolder = this.normalizeCnpj(company.cnpj) ?? company.cnpj.replace(/\D/g, '');
      const fileRow = await this.fileHubClientService.getFileById(batch.file_id);
      const originalName = this.sanitizeFileName(fileRow?.original_name ?? batch.file_name ?? `FORM-${batch.id}.pdf`);
      const toRelativePath = `${cnpjFolder}/${fiscalYear}/FORM/${originalName}`;
      const moved = await this.fileHubClientService.moveFile(batch.file_id, toRelativePath);

      await this.updateBatchItemPayload(batch.id, (p) => ({
        ...p,
        storage: {
          ...(p?.storage || {}),
          approved_storage_key: moved.storageKey,
          approved_relative_path: toRelativePath,
          moved_at: new Date().toISOString(),
        },
      }));
    }

    await this.prisma.formpd_projects.deleteMany({ where: { form_id: form.id } });

    const projects = Array.isArray(formData.projects) ? formData.projects : [];
    for (const p of projects) {
      const title = String(p?.title || 'Projeto sem titulo').trim() || 'Projeto sem titulo';
      const description = String(p?.description || 'Descricao nao informada').trim() || 'Descricao nao informada';
      const createdProject = await this.prisma.formpd_projects.create({
        data: {
          form_id: form.id,
          title,
          description,
          category: p?.category ? String(p.category) : null,
          item_number: this.parseLooseInt(p?.item_number),
          is_continuous: this.parseLooseBool(p?.is_continuous) ?? false,
          start_date: this.parseDateLoose(p?.start_date),
          end_date: this.parseDateLoose(p?.end_date),
          tech_area_code: p?.tech_area_code ? String(p.tech_area_code).slice(0, 10) : null,
          tech_area_label: p?.tech_area_label ? String(p.tech_area_label).slice(0, 200) : null,
          knowledge_area: p?.knowledge_area ? String(p.knowledge_area).slice(0, 255) : null,
          specific_area: p?.specific_area ? String(p.specific_area).slice(0, 500) : null,
          keywords_1: p?.keywords_1 ? String(p.keywords_1) : null,
          keywords_2: p?.keywords_2 ? String(p.keywords_2) : null,
          keywords_3: p?.keywords_3 ? String(p.keywords_3) : null,
          keywords_4: p?.keywords_4 ? String(p.keywords_4) : null,
          keywords_5: p?.keywords_5 ? String(p.keywords_5) : null,
          innovative_element: p?.innovative_element ? String(p.innovative_element) : null,
          innovative_challenge: p?.innovative_challenge ? String(p.innovative_challenge) : null,
          methodology: p?.methodology ? String(p.methodology) : null,
          additional_info: p?.additional_info ? String(p.additional_info) : null,
          economic_result_obtained: p?.economic_result_obtained ? String(p.economic_result_obtained) : null,
          innovation_result_obtained: p?.innovation_result_obtained ? String(p.innovation_result_obtained) : null,
          trl_initial: this.parseLooseInt(p?.trl_initial),
          trl_final: this.parseLooseInt(p?.trl_final),
          pb_pa_or_de: this.parsePbPaOrDe(p?.pb_pa_or_de ?? p?.category),
          aligns_public_policy: this.parseLooseBool(p?.aligns_public_policy),
          public_policy_ref: p?.public_policy_ref ? String(p.public_policy_ref).slice(0, 500) : null,
          extraction_source: 'DETERMINISTIC',
          project_status: 'RASCUNHO',
        },
      });

      const hrs = Array.isArray(p?.human_resources) ? p.human_resources : [];
      if (hrs.length) {
        await this.prisma.formpd_project_human_resources.createMany({
          data: hrs
            .map((hr: any) => ({
              project_id: createdProject.id,
              name: String(hr?.name || '').trim(),
              cpf: hr?.cpf ? String(hr.cpf).replace(/\D/g, '').slice(0, 14) : null,
              role: hr?.role ? String(hr.role).slice(0, 255) : null,
              dedication_pct: this.parseBrCurrency(hr?.dedication_pct),
              is_exclusive_researcher: String(hr?.dedication_type || '').toLowerCase().includes('exclus'),
              annual_amount: this.parseBrCurrency(hr?.annual_amount),
            }))
            .filter((hr) => hr.name.length > 0),
          skipDuplicates: false,
        });
      }

      const expenses = Array.isArray(p?.expenses) ? p.expenses : [];
      if (expenses.length) {
        const seenExpenseKeys = new Set<string>();
        await this.prisma.formpd_project_expenses.createMany({
          data: expenses
            .map((exp: any) => ({
              project_id: createdProject.id,
              expense_category: this.mapExpenseCategory(exp?.category) ?? 'DESPESA_OPERACIONAL',
              description: exp?.description ? String(exp.description).slice(0, 500) : (exp?.category ? String(exp.category).slice(0, 500) : null),
              amount: this.parseBrCurrency(exp?.amount) ?? 0,
            }))
            .filter((exp) => {
              if ((exp.amount ?? 0) <= 0) return false;
              const key = `${exp.expense_category}|${(exp.description ?? '').toLowerCase().trim()}|${Number(exp.amount ?? 0).toFixed(2)}`;
              if (seenExpenseKeys.has(key)) return false;
              seenExpenseKeys.add(key);
              return true;
            }),
          skipDuplicates: false,
        });
      }

      const equipment = Array.isArray(p?.equipment) ? p.equipment : [];
      if (equipment.length) {
        await this.prisma.formpd_project_equipment.createMany({
          data: equipment
            .map((eq: any) => ({
              project_id: createdProject.id,
              origin: String(eq?.origin || '').toUpperCase() === 'IMPORTADO' ? 'IMPORTADO' : 'NACIONAL',
              description: String(eq?.description || eq?.category || 'Equipamento').slice(0, 500),
              quantity: this.parseLooseInt(eq?.quantity) ?? 1,
              unit_amount: this.parseBrCurrency(eq?.amount) ?? 0,
              total_amount: this.parseBrCurrency(eq?.amount) ?? 0,
            }))
            .filter((eq) => (eq.total_amount ?? 0) > 0),
          skipDuplicates: false,
        });
      }
    }

    const fiscalSummary = (formData.fiscal_summary || {}) as Record<string, any>;
    const totalBenefit = Number(fiscalSummary.total_benefit_requested ?? 0);
    const totalExpenditure = Number(fiscalSummary.total_rnd_expenditure ?? 0);

    await this.prisma.formpd_fiscal_incentives.upsert({
      where: { form_id: form.id },
      update: {
        total_benefit: totalBenefit,
        total_rnd_expenditure: totalExpenditure,
        updated_at: new Date(),
      },
      create: {
        form_id: form.id,
        total_benefit: totalBenefit,
        total_rnd_expenditure: totalExpenditure,
      },
    });

    const companyIdentification = (formData.company_identification || parsed.company_identification || {}) as Record<string, any>;
    const companyIdentFields = (companyIdentification.fields || {}) as Record<string, any>;
    const companyIdentQa = Array.isArray(companyIdentification.qa) ? companyIdentification.qa : [];

    try {
      const companyType = companyIdentFields.company_type ? String(companyIdentFields.company_type) : null;
      const companyStatus = companyIdentFields.company_status ? String(companyIdentFields.company_status) : null;
      const benefitsLaw = companyIdentFields.benefits_law_11196_8248
        ? String(companyIdentFields.benefits_law_11196_8248)
        : null;
      const capitalOrigin = companyIdentFields.capital_origin ? String(companyIdentFields.capital_origin) : null;
      const groupRelationship = companyIdentFields.group_relationship ? String(companyIdentFields.group_relationship) : null;
      const grossRevenue = this.parseBrCurrency(companyIdentFields.gross_operational_revenue);
      const netRevenue = this.parseBrCurrency(companyIdentFields.net_revenue);
      const employeeCount = this.parseLooseInt(companyIdentFields.employee_count_with_contract);
      const taxLoss = this.parseLooseBool(companyIdentFields.closed_year_with_tax_loss);
      const irpjCsll = companyIdentFields.irpj_csll_apportionment
        ? String(companyIdentFields.irpj_csll_apportionment)
        : null;
      const incentivesReason = companyIdentFields.incentives_reason ? String(companyIdentFields.incentives_reason) : null;
      const rndOrg = companyIdentFields.rnd_organizational_structure
        ? String(companyIdentFields.rnd_organizational_structure)
        : null;
      const qaJson = JSON.stringify(companyIdentQa ?? []);
      const rawText = companyIdentification.raw_text ? String(companyIdentification.raw_text) : null;

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO formpd_company_identification
          (form_id, company_type, company_status, benefits_law_11196_8248, capital_origin, group_relationship,
           gross_operational_revenue, net_revenue, employee_count_with_contract, closed_year_with_tax_loss,
           irpj_csll_apportionment, incentives_reason, rnd_organizational_structure, qa_json, raw_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           company_type=VALUES(company_type),
           company_status=VALUES(company_status),
           benefits_law_11196_8248=VALUES(benefits_law_11196_8248),
           capital_origin=VALUES(capital_origin),
           group_relationship=VALUES(group_relationship),
           gross_operational_revenue=VALUES(gross_operational_revenue),
           net_revenue=VALUES(net_revenue),
           employee_count_with_contract=VALUES(employee_count_with_contract),
           closed_year_with_tax_loss=VALUES(closed_year_with_tax_loss),
           irpj_csll_apportionment=VALUES(irpj_csll_apportionment),
           incentives_reason=VALUES(incentives_reason),
           rnd_organizational_structure=VALUES(rnd_organizational_structure),
           qa_json=VALUES(qa_json),
           raw_text=VALUES(raw_text),
           updated_at=NOW()`,
        form.id,
        companyType,
        companyStatus,
        benefitsLaw,
        capitalOrigin,
        groupRelationship,
        grossRevenue,
        netRevenue,
        employeeCount,
        taxLoss === null ? null : taxLoss ? 1 : 0,
        irpjCsll,
        incentivesReason,
        rndOrg,
        qaJson,
        rawText,
      );
    } catch {
      // Keep approval flow resilient while database migration is pending.
    }

    await this.prisma.import_batches.update({
      where: { id: batch.id },
      data: {
        status: 'APPROVED',
        processed_records: 1,
        success_count: 1,
        error_count: 0,
        updated_at: new Date(),
      },
    });
    await this.prisma.import_items.updateMany({
      where: { batch_id: batch.id },
      data: { status: 'APPROVED', error_message: null, updated_at: new Date() },
    });

    await this.notificationServiceClient.publish('formpd:approved', {
      batchId: batch.id,
      formId: form.id,
      companyId: batch.company_id,
      fiscalYear,
    });

    return { success: true, batchId: batch.id, formId: form.id };
  }

  async discardFormpdBatch(batchIdRaw: string) {
    const batchId = Number(batchIdRaw);
    if (!Number.isFinite(batchId)) throw new BadRequestException('Batch invalido');

    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch || batch.entity_type !== this.formEntityType) {
      throw new NotFoundException('Lote FORMP&D nao encontrado');
    }

    await this.prisma.import_batches.update({
      where: { id: batch.id },
      data: { status: 'DISCARDED', updated_at: new Date() },
    });
    await this.prisma.import_items.updateMany({
      where: { batch_id: batch.id },
      data: { status: 'DISCARDED', updated_at: new Date() },
    });
    return { success: true, batchId: batch.id };
  }

  async enqueueAi(batchIdRaw: string, input?: { fields?: string[] }) {
    const batchId = Number(batchIdRaw);
    if (!Number.isFinite(batchId)) throw new BadRequestException('Batch invalido');
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch || batch.entity_type !== this.formEntityType) throw new NotFoundException('Lote FORMP&D nao encontrado');

    const item = await this.readFirstBatchItem(batch.id);
    if (!item) throw new NotFoundException('Item do lote nao encontrado');
    const parsed = this.safeJsonParse<any>(item.record_data, {});

    const payloadMissing = Array.isArray(parsed?.missing_fields) ? parsed.missing_fields : [];
    const requestedRaw = Array.isArray(input?.fields) ? input?.fields : [];
    const requested = [...new Set(requestedRaw.filter((f): f is string => typeof f === 'string' && f.trim().length > 0))];
    const fields = requested.length ? requested : payloadMissing;

    await this.prisma.import_batches.update({
      where: { id: batch.id },
      data: { status: 'AI_QUEUED', updated_at: new Date() },
    });

    await this.updateBatchItemPayload(
      batch.id,
      (p) => ({
        ...p,
        needs_ai: true,
        ai_request: {
          queued_at: new Date().toISOString(),
          source: 'manual_review',
          requested_fields: fields,
        },
      }),
      'PENDING_REVIEW',
    );

    await this.notificationServiceClient.publish('formpd:ai-queued', {
      batchId: batch.id,
      companyId: batch.company_id ?? null,
      fields,
    });

    return { success: true, batchId: batch.id, status: 'AI_QUEUED', fields };
  }

  async reprocessFormpdParse(batchIdRaw: string) {
    const batchId = Number(batchIdRaw);
    if (!Number.isFinite(batchId)) throw new BadRequestException('Batch invalido');

    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch || batch.entity_type !== this.formEntityType) {
      throw new NotFoundException('Lote FORMP&D nao encontrado');
    }

    if (['PROCESSING', 'PENDING', 'PAUSED'].includes(batch.status)) {
      throw new BadRequestException(`Lote #${batch.id} em status ${batch.status}; aguarde para reprocessar parse.`);
    }

    const item = await this.readFirstBatchItem(batch.id);
    if (!item) throw new NotFoundException('Item do lote nao encontrado');

    const parsed = this.safeJsonParse<any>(item.record_data, {});
    const filePath = await this.getFormpdPdfPath(String(batch.id));
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = batch.file_name || path.basename(filePath) || `formpd-${batch.id}.pdf`;

    const extraction = await this.pdfExtractorClient.extract({
      fieldname: 'file',
      originalname: fileName,
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: fileBuffer.length,
      buffer: fileBuffer,
      stream: undefined as any,
      destination: '',
      filename: '',
      path: filePath,
    } as Express.Multer.File);

    const normalizedCnpj = this.normalizeCnpj(extraction.cnpj_from_form);
    const extractedCompany = normalizedCnpj
      ? await this.prisma.companies.findUnique({ where: { cnpj: normalizedCnpj } })
      : null;

    const effectiveCompanyId = batch.company_id ?? extractedCompany?.id ?? null;
    let status = 'PENDING_REVIEW';
    if (!extraction.is_valid_formpd) status = 'INVALID_FORMPD';
    else if (!effectiveCompanyId) status = 'COMPANY_NOT_FOUND';

    const payload = {
      ...extraction,
      cnpj_from_form: normalizedCnpj,
      company_id: effectiveCompanyId,
      company_name: extractedCompany?.legal_name ?? extraction.company_name ?? parsed.company_name ?? null,
      file_id: batch.file_id ?? parsed.file_id ?? null,
      intake_id: parsed.intake_id ?? null,
      file_job_id: item.file_job_id ?? parsed.file_job_id ?? null,
      reparsed_at: new Date().toISOString(),
    };

    await this.prisma.import_batches.update({
      where: { id: batch.id },
      data: {
        status,
        company_id: effectiveCompanyId,
        total_records: 1,
        processed_records: 1,
        success_count: status === 'INVALID_FORMPD' ? 0 : 1,
        error_count: status === 'INVALID_FORMPD' ? 1 : 0,
        updated_at: new Date(),
      },
    });

    await this.prisma.import_items.update({
      where: { id: item.id },
      data: {
        record_data: JSON.stringify(payload),
        status: status === 'INVALID_FORMPD' ? 'ERROR' : 'PENDING_REVIEW',
        error_message: status === 'INVALID_FORMPD' ? 'Documento nao reconhecido como FORMP&D valido' : null,
        updated_at: new Date(),
      },
    });

    await this.notificationServiceClient.publish('formpd:completed', {
      batchId: batch.id,
      status,
      cnpjFromForm: normalizedCnpj,
      companyId: effectiveCompanyId,
      companyName: extractedCompany?.legal_name ?? extraction.company_name ?? null,
    });

    return {
      success: true,
      batchId: batch.id,
      status,
      companyId: effectiveCompanyId,
      cnpjFromForm: normalizedCnpj,
      reparsed: true,
    };
  }

  async getFormpdPdfPath(batchIdRaw: string) {
    const batchId = Number(batchIdRaw);
    if (!Number.isFinite(batchId)) throw new BadRequestException('Batch invalido');

    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch || batch.entity_type !== this.formEntityType) throw new NotFoundException('Lote FORMP&D nao encontrado');
    if (!batch.file_id) throw new NotFoundException('Arquivo nao vinculado ao lote');

    const fileRow = await this.fileHubClientService.getFileById(batch.file_id);
    if (fileRow?.storage_key && fs.existsSync(fileRow.storage_key)) {
      return fileRow.storage_key;
    }

    // Fallback for historical dedup cases where file_hub kept an old storage_key.
    const trace = await this.fileHubClientService.getBatchTrace(batch.file_id, batch.id);
    const events = Array.isArray(trace?.events) ? trace.events : [];
    for (let i = events.length - 1; i >= 0; i--) {
      const payload = events[i]?.event_payload || {};
      const candidate = typeof payload.storageKey === 'string' ? payload.storageKey : null;
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }

    throw new NotFoundException('PDF do lote nao encontrado no storage');
  }

  async getBatches(params: Record<string, any>) {
    const page = Math.max(Number(params?.page || 1), 1);
    const limit = Math.min(Math.max(Number(params?.limit || 20), 1), 200);
    const search = String(params?.search || '').trim().toLowerCase();
    const entityType = String(params?.entityType || '').trim();
    const companyId = params?.companyId ? Number(params.companyId) : null;
    const offset = (page - 1) * limit;

    if (entityType === this.formEntityType) {
      const where: any = { entity_type: this.formEntityType };
      if (companyId) where.company_id = companyId;
      if (search) {
        where.OR = [
          { file_name: { contains: search } },
          { status: { contains: search } },
        ];
      }

      const [rows, total] = await Promise.all([
        this.prisma.import_batches.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip: offset,
          take: limit,
        }),
        this.prisma.import_batches.count({ where }),
      ]);

      const mapped = rows.map((b) => this.mapBatch(b));
      return {
        data: mapped,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        page,
        limit,
      };
    }

    // Global listing (no explicit entityType): keep FORMPD visible even if import-service is down.
    if (!entityType) {
      const localWhere: any = { entity_type: this.formEntityType };
      if (companyId) localWhere.company_id = companyId;

      const localRows = await this.prisma.import_batches.findMany({
        where: localWhere,
        orderBy: { created_at: 'desc' },
        take: 1000,
      });
      const localMapped = localRows.map((b) => this.mapBatch(b));

      let remoteMapped: any[] = [];
      try {
        const remoteData = await this.importServiceClient.getBatches({
          limit: 1000,
          offset: 0,
        });
        remoteMapped = (Array.isArray(remoteData) ? remoteData : []).map((b) => this.mapBatch(b));
      } catch {
        remoteMapped = [];
      }

      const combined = [...localMapped, ...remoteMapped].sort(
        (a, b) => new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime(),
      );

      const filtered = search
        ? combined.filter((b) =>
            [b.file_name, b.entity_type, b.status, String(b.id)]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(search)),
          )
        : combined;

      const pageData = filtered.slice(offset, offset + limit);
      const total = filtered.length;
      const totalPages = Math.max(Math.ceil(total / limit), 1);
      return { data: pageData, total, totalPages, page, limit };
    }

    const fetchLimit = search ? 1000 : limit;
    const fetchOffset = search ? 0 : offset;
    const data = await this.importServiceClient.getBatches({
      limit: fetchLimit,
      offset: fetchOffset,
      entityType: entityType || undefined,
    });

    const mapped = (Array.isArray(data) ? data : []).map((b) => this.mapBatch(b));
    const filtered = search
      ? mapped.filter((b) =>
          [b.file_name, b.entity_type, b.status, String(b.id)]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(search)),
        )
      : mapped;

    const pageData = search ? filtered.slice(offset, offset + limit) : filtered;
    const total = filtered.length;
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    return { data: pageData, total, totalPages, page, limit };
  }

  async getBatch(id: string) {
    const local = await this.findFormBatchById(id);
    if (local && local.entity_type === this.formEntityType) return this.mapBatch(local);
    const data = await this.importServiceClient.getBatch(id);
    return this.mapBatch(data);
  }

  async getBatchRows(id: string, params: Record<string, any>) {
    const local = await this.findFormBatchById(id);
    if (local && local.entity_type === this.formEntityType) {
      const page = Math.max(Number(params?.page || 1), 1);
      const limit = Math.min(Math.max(Number(params?.limit || 10), 1), 200);
      const offset = (page - 1) * limit;

      const [rows, total] = await Promise.all([
        this.prisma.import_items.findMany({
          where: { batch_id: local.id },
          orderBy: { id: 'asc' },
          skip: offset,
          take: limit,
        }),
        this.prisma.import_items.count({ where: { batch_id: local.id } }),
      ]);

      const mappedRows = rows.map((r: any) => ({
        ...r,
        payload_json: r.record_data,
        record_data: r.record_data,
      }));

      return { data: mappedRows, total, totalPages: Math.max(Math.ceil(total / limit), 1), page, limit };
    }

    const page = Math.max(Number(params?.page || 1), 1);
    const limit = Math.min(Math.max(Number(params?.limit || 10), 1), 200);
    const offset = (page - 1) * limit;
    const data = await this.importServiceClient.getBatchRows(id, { limit, offset });
    const rows = Array.isArray(data) ? data : [];
    const mappedRows = rows.map((r: any) => {
      const payload = typeof r.payload_json === 'string' ? JSON.parse(r.payload_json) : r.payload_json;
      const recordValue = payload?.cnpj ?? payload?.cpf ?? payload?.email ?? JSON.stringify(payload ?? {});
      return {
        ...r,
        record_data: recordValue,
      };
    });

    const batch = await this.importServiceClient.getBatch(id);
    const total = Number(batch?.total_rows ?? mappedRows.length);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    return { data: mappedRows, total, totalPages, page, limit };
  }

  async reprocessBatch(id: string) {
    return this.importServiceClient.reprocessBatch(id);
  }

  async deleteBatch(id: string) {
    const local = await this.findFormBatchById(id);
    if (local && local.entity_type === this.formEntityType) {
      await this.prisma.import_batches.delete({ where: { id: local.id } });
      return { success: true, id: local.id };
    }
    return this.importServiceClient.deleteBatch(id);
  }

  async getBatchTrace(id: string) {
    const local = await this.findFormBatchById(id);
    if (local && local.entity_type === this.formEntityType) {
      const items = await this.prisma.import_items.findMany({
        where: { batch_id: local.id },
        orderBy: { id: 'asc' },
      });

      let fileTrace: any = { intakes: [], jobs: [], events: [] };
      if (local.file_id) {
        try {
          fileTrace = await this.fileHubClientService.getBatchTrace(local.file_id, local.id);
        } catch {
          fileTrace = { intakes: [], jobs: [], events: [] };
        }
      }

      return {
        batch: local,
        items,
        intakes: fileTrace.intakes ?? [],
        jobs: fileTrace.jobs ?? [],
        events: fileTrace.events ?? [],
      };
    }

    return this.importServiceClient.getBatchTrace(id);
  }

  async getFileJobTrace(fileJobId: string) {
    return this.fileHubClientService.getFileJobTrace(fileJobId);
  }
}
