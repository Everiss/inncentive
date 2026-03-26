import axios from 'axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FileHubClientService {
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = (this.configService.get<string>('FILE_HUB_URL') || 'http://localhost:8030').trim();
  }

  async computeSha256(buffer: Buffer): Promise<string> {
    const contentBase64 = buffer.toString('base64');
    const response = await axios.post<{ hash: string }>(`${this.baseUrl}/hash`, { contentBase64 });
    return response.data.hash;
  }

  async registerUploadIntake(input: {
    filePath: string;
    originalName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    companyId?: number | null;
    receivedBy?: number | null;
    source?: string;
    sourceRef?: string | null;
    hash?: string;
  }) {
    const response = await axios.post(`${this.baseUrl}/intakes/register-upload`, input);
    return response.data as { fileId: string; intakeId: string; fileHash: string; dedupHit: boolean };
  }

  async markIntakeDedupDone(intakeId: string) {
    await axios.patch(`${this.baseUrl}/intakes/${intakeId}/mark-dedup-done`);
  }

  async createProcessingJob(input: {
    fileId: string;
    intakeId?: string | null;
    jobType: string;
    processor: string;
    processorVersion?: string;
    priority?: number;
    idempotencyKey?: string | null;
  }) {
    const response = await axios.post(`${this.baseUrl}/jobs/create-processing`, input);
    return response.data as { id: string };
  }

  async markJobStarted(fileId: string, fileJobId: string, intakeId?: string | null) {
    await axios.post(`${this.baseUrl}/jobs/${fileJobId}/start`, { fileId, intakeId });
  }

  async markJobProgress(fileId: string, fileJobId: string, current: number, total: number, intakeId?: string | null) {
    await axios.post(`${this.baseUrl}/jobs/${fileJobId}/progress`, { fileId, intakeId, current, total });
  }

  async markJobCompleted(fileId: string, fileJobId: string, intakeId?: string | null, payload?: Record<string, unknown>) {
    await axios.post(`${this.baseUrl}/jobs/${fileJobId}/complete`, { fileId, intakeId, payload });
  }

  async markJobFailed(fileId: string, fileJobId: string, errorMessage: string, intakeId?: string | null) {
    await axios.post(`${this.baseUrl}/jobs/${fileJobId}/fail`, { fileId, intakeId, errorMessage });
  }

  async addArtifact(fileJobId: string, artifactType: string, contentJson: unknown, artifactVersion = 1) {
    const response = await axios.post(`${this.baseUrl}/artifacts/upsert`, {
      fileJobId,
      artifactType,
      contentJson,
      artifactVersion,
    });
    return response.data;
  }

  async getFileById(fileId: string) {
    const response = await axios.get(`${this.baseUrl}/files/${fileId}`);
    return response.data as {
      id: string;
      sha256: string;
      mime_type: string | null;
      original_name: string | null;
      size_bytes: string | null;
      storage_key: string;
      created_at: string;
    } | null;
  }

  async getLatestIntake(fileId: string, sourceRef?: string | null) {
    const response = await axios.get(`${this.baseUrl}/intakes/latest`, {
      params: { fileId, ...(sourceRef !== undefined ? { sourceRef } : {}) },
    });
    return response.data as { id: string } | null;
  }

  async getLatestJobByIntake(intakeId: string, jobType?: string) {
    const response = await axios.get(`${this.baseUrl}/jobs/latest`, { params: { intakeId, jobType } });
    return response.data as { id: string } | null;
  }

  async getBatchTrace(fileId: string, batchId: number) {
    const response = await axios.get(`${this.baseUrl}/trace/files/${fileId}`, {
      params: { sourceRef: `batch:${batchId}` },
    });
    return response.data as {
      file: any;
      intakes: any[];
      jobs: any[];
      events: any[];
    };
  }

  async getFileJobTrace(fileJobId: string) {
    const response = await axios.get(`${this.baseUrl}/trace/file-jobs/${fileJobId}`);
    return response.data as {
      job: any;
      artifacts: any[];
      events: any[];
    };
  }
}

