import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';

type RegisterUploadInput = {
  filePath: string;
  originalName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  companyId?: number | null;
  receivedBy?: number | null;
  source?: string;
  sourceRef?: string | null;
  hash?: string;
};

type CreateJobInput = {
  fileId: string;
  intakeId?: string | null;
  jobType: string;
  processor: string;
  processorVersion?: string;
  priority?: number;
  idempotencyKey?: string | null;
};

@Injectable()
export class FileHubService {
  constructor(private readonly prisma: PrismaService) {}

  computeSha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  async registerUploadIntake(input: RegisterUploadInput) {
    const {
      filePath,
      originalName = null,
      mimeType = null,
      sizeBytes = null,
      companyId = null,
      receivedBy = null,
      source = 'UPLOAD_UI',
      sourceRef = null,
      hash,
    } = input;

    const sha256 = hash ?? '';
    if (!sha256) throw new Error('registerUploadIntake requires a non-empty file hash');

    const extension = originalName ? path.extname(originalName).replace('.', '').toLowerCase() : null;
    const existing = await (this.prisma as any).files.findUnique({
      where: { sha256 },
      select: { id: true, company_id: true },
    });

    const file = existing
      ? await (this.prisma as any).files.update({
          where: { id: existing.id },
          data: {
            company_id: existing.company_id ?? companyId ?? null,
            size_bytes: sizeBytes ?? undefined,
            mime_type: mimeType ?? undefined,
            original_name: originalName ?? undefined,
            extension: extension ?? undefined,
            deleted_at: null,
          },
        })
      : await (this.prisma as any).files.create({
          data: {
            company_id: companyId ?? null,
            sha256,
            size_bytes: sizeBytes,
            mime_type: mimeType,
            original_name: originalName,
            extension,
            storage_backend: 'LOCAL',
            storage_key: filePath,
            storage_bucket: null,
            uploaded_by: receivedBy,
          },
        });

    const intake = await (this.prisma as any).file_intakes.create({
      data: {
        file_id: file.id,
        source,
        source_ref: sourceRef,
        intake_status: 'RECEIVED',
        dedup_hit: !!existing,
        received_by: receivedBy,
      },
    });

    await this.appendEvent({
      fileId: file.id,
      intakeId: intake.id,
      eventType: existing ? 'FILE_REUSED' : 'FILE_REGISTERED',
      payload: {
        source,
        sourceRef,
        sha256,
        storageKey: filePath,
      },
      actorContactId: receivedBy,
    });

    return {
      fileId: file.id as string,
      intakeId: intake.id as string,
      fileHash: sha256,
      dedupHit: !!existing,
    };
  }

  async createProcessingJob(input: CreateJobInput) {
    const {
      fileId,
      intakeId = null,
      jobType,
      processor,
      processorVersion = 'v1',
      priority = 5,
      idempotencyKey = null,
    } = input;

    const job = await (this.prisma as any).file_jobs.upsert({
      where: {
        file_id_job_type_processor_processor_version: {
          file_id: fileId,
          job_type: jobType,
          processor,
          processor_version: processorVersion,
        },
      },
      update: {
        intake_id: intakeId,
        job_status: 'QUEUED',
        priority,
        attempt: 1,
        progress_current: 0,
        progress_total: 0,
        started_at: null,
        finished_at: null,
        error_message: null,
        idempotency_key: idempotencyKey ?? undefined,
      },
      create: {
        file_id: fileId,
        intake_id: intakeId,
        job_type: jobType,
        processor,
        processor_version: processorVersion,
        job_status: 'QUEUED',
        priority,
        idempotency_key: idempotencyKey,
      },
    });

    if (intakeId) {
      await (this.prisma as any).file_intakes.update({
        where: { id: intakeId },
        data: {
          intake_status: 'QUEUED',
          queued_at: new Date(),
        },
      });
    }

    await this.appendEvent({
      fileId,
      intakeId,
      fileJobId: job.id,
      eventType: 'JOB_QUEUED',
      payload: {
        jobType,
        processor,
        processorVersion,
        priority,
      },
    });

    return job as { id: string };
  }

  async markJobStarted(fileId: string, fileJobId: string, intakeId?: string | null) {
    await (this.prisma as any).file_jobs.update({
      where: { id: fileJobId },
      data: { job_status: 'PROCESSING', started_at: new Date(), error_message: null },
    });

    if (intakeId) {
      await (this.prisma as any).file_intakes.update({
        where: { id: intakeId },
        data: { intake_status: 'PROCESSING', started_at: new Date() },
      });
    }

    await this.appendEvent({
      fileId,
      intakeId,
      fileJobId,
      eventType: 'JOB_STARTED',
    });
  }

  async markJobProgress(
    fileId: string,
    fileJobId: string,
    current: number,
    total: number,
    intakeId?: string | null,
  ) {
    await (this.prisma as any).file_jobs.update({
      where: { id: fileJobId },
      data: {
        progress_current: current,
        progress_total: total,
        job_status: 'PROCESSING',
      },
    });

    await this.appendEvent({
      fileId,
      intakeId,
      fileJobId,
      eventType: 'JOB_PROGRESS',
      payload: { current, total },
    });
  }

  async markJobCompleted(
    fileId: string,
    fileJobId: string,
    intakeId?: string | null,
    payload?: Record<string, unknown>,
  ) {
    await (this.prisma as any).file_jobs.update({
      where: { id: fileJobId },
      data: { job_status: 'DONE', finished_at: new Date(), error_message: null },
    });

    if (intakeId) {
      await (this.prisma as any).file_intakes.update({
        where: { id: intakeId },
        data: { intake_status: 'DONE', finished_at: new Date(), error_message: null },
      });
    }

    await this.appendEvent({
      fileId,
      intakeId,
      fileJobId,
      eventType: 'JOB_COMPLETED',
      payload,
    });
  }

  async markJobFailed(
    fileId: string,
    fileJobId: string,
    errorMessage: string,
    intakeId?: string | null,
  ) {
    await (this.prisma as any).file_jobs.update({
      where: { id: fileJobId },
      data: { job_status: 'ERROR', finished_at: new Date(), error_message: errorMessage },
    });

    if (intakeId) {
      await (this.prisma as any).file_intakes.update({
        where: { id: intakeId },
        data: { intake_status: 'ERROR', finished_at: new Date(), error_message: errorMessage },
      });
    }

    await this.appendEvent({
      fileId,
      intakeId,
      fileJobId,
      eventType: 'JOB_FAILED',
      payload: { errorMessage },
    });
  }

  async addArtifact(
    fileJobId: string,
    artifactType: string,
    contentJson: unknown,
    artifactVersion = 1,
  ) {
    return (this.prisma as any).file_artifacts.upsert({
      where: {
        file_job_id_artifact_type_artifact_version: {
          file_job_id: fileJobId,
          artifact_type: artifactType,
          artifact_version: artifactVersion,
        },
      },
      update: { content_json: contentJson },
      create: {
        file_job_id: fileJobId,
        artifact_type: artifactType,
        artifact_version: artifactVersion,
        content_json: contentJson,
      },
    });
  }

  private async appendEvent(input: {
    fileId: string;
    intakeId?: string | null;
    fileJobId?: string | null;
    eventType: string;
    payload?: Record<string, unknown>;
    actorContactId?: number | null;
  }) {
    const { fileId, intakeId = null, fileJobId = null, eventType, payload = {}, actorContactId = null } = input;
    await (this.prisma as any).file_events.create({
      data: {
        file_id: fileId,
        intake_id: intakeId,
        file_job_id: fileJobId,
        event_type: eventType,
        event_payload: payload,
        actor_contact_id: actorContactId,
      },
    });
  }
}
