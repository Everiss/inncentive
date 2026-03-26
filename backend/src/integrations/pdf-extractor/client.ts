import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import FormData = require('form-data');

@Injectable()
export class PdfExtractorClient {
  private readonly http: AxiosInstance;

  constructor() {
    const baseURL = process.env.PDF_EXTRACTOR_URL ?? 'http://localhost:8010';
    this.http = axios.create({ baseURL, timeout: 180000 });
  }

  private handleError(error: unknown): never {
    if (error instanceof AxiosError) {
      const status = error.response?.status ?? HttpStatus.BAD_GATEWAY;
      const payload = error.response?.data ?? { message: error.message };
      throw new HttpException(payload, status);
    }
    throw new HttpException({ message: 'Erro ao comunicar com pdf-extractor.' }, HttpStatus.BAD_GATEWAY);
  }

  async extract(file: Express.Multer.File) {
    const form = new FormData();
    form.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype || 'application/pdf',
    });

    try {
      const { data } = await this.http.post('/extract', form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
      });
      return data as {
        is_valid_formpd: boolean;
        extraction_source: string;
        confidence: string;
        cnpj_from_form: string | null;
        company_name: string | null;
        fiscal_year: number | null;
        form_data: Record<string, unknown>;
        missing_fields: string[];
        ai_candidates: Array<Record<string, unknown>>;
        needs_ai: boolean;
        meta: Record<string, unknown>;
      };
    } catch (error) {
      this.handleError(error);
    }
  }
}
