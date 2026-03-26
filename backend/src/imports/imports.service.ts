import { Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';
import { FileHubClientService } from '../integrations/file-hub/client';
import { ImportServiceClient } from '../integrations/import-service/client';

@Injectable()
export class ImportsService {
  constructor(
    private readonly importServiceClient: ImportServiceClient,
    private readonly fileHubClientService: FileHubClientService,
  ) {}

  private mapBatch(batch: any) {
    return {
      ...batch,
      file_name: batch.file_name ?? batch.source_filename ?? null,
      entity_type: batch.entity_type ?? null,
      total_records: Number(batch.total_rows ?? 0),
      processed_records: Number(batch.processed_rows ?? 0),
      success_count: Number(batch.success_rows ?? 0),
      error_count: Number(batch.error_rows ?? 0),
    };
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
        try {
          await this.ensureTemplateExists(legacyType);
          const data = await this.performUpload(templateCode, file);
          return {
            ...data,
            message: 'Lote criado com sucesso!',
          };
        } catch (retryError) {
          throw retryError;
        }
      }
      throw error;
    }
  }

  async getBatches(params: Record<string, any>) {
    const page = Math.max(Number(params?.page || 1), 1);
    const limit = Math.min(Math.max(Number(params?.limit || 20), 1), 200);
    const search = String(params?.search || '').trim().toLowerCase();
    const entityType = String(params?.entityType || '').trim();
    const offset = (page - 1) * limit;

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
    const data = await this.importServiceClient.getBatch(id);
    return this.mapBatch(data);
  }

  async getBatchRows(id: string, params: Record<string, any>) {
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
    return this.importServiceClient.deleteBatch(id);
  }

  async getBatchTrace(id: string) {
    return this.importServiceClient.getBatchTrace(id);
  }

  async getFileJobTrace(fileJobId: string) {
    return this.fileHubClientService.getFileJobTrace(fileJobId);
  }
}
