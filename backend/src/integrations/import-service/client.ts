import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import FormData from 'form-data';

@Injectable()
export class ImportServiceClient {
  private readonly http: AxiosInstance;

  constructor() {
    const baseURL = process.env.IMPORT_SERVICE_URL ?? 'http://localhost:8040';
    this.http = axios.create({ baseURL, timeout: 120000 });
  }

  private handleError(error: unknown): never {
    if (error instanceof AxiosError) {
      const status = error.response?.status ?? HttpStatus.BAD_GATEWAY;
      const payload = error.response?.data ?? { message: error.message };
      throw new HttpException(payload, status);
    }
    throw new HttpException({ message: 'Erro ao comunicar com import-service.' }, HttpStatus.BAD_GATEWAY);
  }

  async getTemplates() {
    try {
      const { data } = await this.http.get('/templates');
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async createTemplate(payload: any) {
    try {
      const { data } = await this.http.post('/templates', payload);
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async upload(templateCode: string, file: Express.Multer.File) {
    const form = new FormData();
    form.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype || 'application/octet-stream',
    });
    try {
      const { data } = await this.http.post(
        `/imports/upload?templateCode=${encodeURIComponent(templateCode)}`,
        form,
        { headers: form.getHeaders(), maxBodyLength: Infinity },
      );
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getBatches(params: Record<string, any>) {
    try {
      const { data } = await this.http.get('/imports/batches', { params });
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getBatch(id: string) {
    try {
      const { data } = await this.http.get(`/imports/batches/${id}`);
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getBatchRows(id: string, params: Record<string, any>) {
    try {
      const { data } = await this.http.get(`/imports/batches/${id}/rows`, { params });
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async reprocessBatch(id: string) {
    try {
      const { data } = await this.http.post(`/imports/batches/${id}/reprocess`);
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async deleteBatch(id: string) {
    try {
      const { data } = await this.http.delete(`/imports/batches/${id}`);
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getBatchTrace(id: string) {
    try {
      const { data } = await this.http.get(`/imports/batches/${id}/trace`);
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }
}

