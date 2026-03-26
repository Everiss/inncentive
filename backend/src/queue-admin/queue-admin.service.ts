import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

type SupportedQueue = 'import-cnpjs' | 'formpd-extraction';

@Injectable()
export class QueueAdminService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('import-cnpjs') private readonly importQueue: Queue,
    @InjectQueue('formpd-extraction') private readonly formpdQueue: Queue,
  ) {}

  private getQueue(queueName: SupportedQueue): Queue {
    switch (queueName) {
      case 'import-cnpjs':
        return this.importQueue;
      case 'formpd-extraction':
        return this.formpdQueue;
      default:
        throw new BadRequestException(`Fila não suportada: ${queueName}`);
    }
  }

  private resolveBatchJobName(entityType: string): string {
    if (entityType === 'COMPANIES') return 'process-cnpj';
    if (entityType === 'CONTACTS') return 'process-contact';
    if (entityType === 'COLLABORATORS') return 'process-collaborator';
    if (entityType === 'PROJECTS') return 'process-project';
    throw new BadRequestException(
      `Entity type ${entityType} não é suportado para requeue nesta fila.`,
    );
  }

  private buildJobData(entityType: string, item: any, batchId: number): any {
    if (entityType === 'COMPANIES') {
      return {
        itemId: item.id,
        batchId,
        cnpj: item.record_data,
        ...(item.file_job_id ? { fileJobId: item.file_job_id } : {}),
      };
    }

    const payload = JSON.parse(item.record_data);
    if (entityType === 'CONTACTS') {
      return {
        itemId: item.id,
        batchId,
        payload,
        companyId: null,
        ...(item.file_job_id ? { fileJobId: item.file_job_id } : {}),
      };
    }
    if (entityType === 'COLLABORATORS') {
      return {
        itemId: item.id,
        batchId,
        payload,
        companyId: null,
        ...(item.file_job_id ? { fileJobId: item.file_job_id } : {}),
      };
    }
    if (entityType === 'PROJECTS') {
      return {
        itemId: item.id,
        batchId,
        payload,
        companyId: null,
        ...(item.file_job_id ? { fileJobId: item.file_job_id } : {}),
      };
    }
    throw new BadRequestException(`Entity type ${entityType} sem mapeamento de payload.`);
  }

  async getQueueStatus(queueName: SupportedQueue) {
    const queue = this.getQueue(queueName);
    const [counts, paused] = await Promise.all([
      queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
      queue.isPaused(),
    ]);
    return { queue: queueName, paused, counts };
  }

  async pauseQueue(queueName: SupportedQueue) {
    const queue = this.getQueue(queueName);
    await queue.pause();
    return this.getQueueStatus(queueName);
  }

  async resumeQueue(queueName: SupportedQueue) {
    const queue = this.getQueue(queueName);
    await queue.resume();
    return this.getQueueStatus(queueName);
  }

  async requeuePending(batchId: number, queueName: SupportedQueue = 'import-cnpjs') {
    const queue = this.getQueue(queueName);
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote não encontrado');

    const jobName = this.resolveBatchJobName(batch.entity_type);
    const pendingItems = await this.prisma.import_items.findMany({
      where: { batch_id: batchId, status: 'PENDING' },
      select: { id: true, record_data: true, file_job_id: true },
      orderBy: { id: 'asc' },
    });

    if (pendingItems.length === 0) {
      return {
        success: true,
        queue: queueName,
        batchId,
        requeued: 0,
        message: 'Nenhum item PENDING para reenfileirar.',
      };
    }

    const jobs = pendingItems.map((item) => ({
      name: jobName,
      data: this.buildJobData(batch.entity_type, item, batchId),
      opts: {
        jobId: `manual-requeue-pending-b${batchId}-i${item.id}-${Date.now()}`,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    }));

    for (let i = 0; i < jobs.length; i += 500) {
      await queue.addBulk(jobs.slice(i, i + 500));
    }

    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: { status: 'PROCESSING', updated_at: new Date() },
    });

    return {
      success: true,
      queue: queueName,
      batchId,
      requeued: jobs.length,
      message: `${jobs.length} itens PENDING reenfileirados.`,
    };
  }

  /**
   * Pauses a specific batch job by removing it from the queue and marking
   * the batch as PAUSED. Works for waiting jobs (not yet active).
   * Active jobs (currently processing) are moved to failed so they stop.
   */
  async pauseBatchJob(batchId: number, queueName: SupportedQueue = 'formpd-extraction') {
    const queue = this.getQueue(queueName);
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote não encontrado');

    // Search waiting and active jobs for this batch
    const [waitingJobs, activeJobs] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
    ]);
    const allJobs = [...waitingJobs, ...activeJobs];
    const batchJob = allJobs.find(j => j.data?.batchId === batchId);

    if (batchJob) {
      await batchJob.remove();
    }

    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: { status: 'PAUSED', updated_at: new Date() },
    });

    return { success: true, batchId, message: 'Lote pausado. Job removido da fila.' };
  }

  /**
   * Resumes a paused FORMPD batch by reconstructing the job data from the
   * batch record and re-adding it to the queue.
   */
  async resumeBatchJob(batchId: number, queueName: SupportedQueue = 'formpd-extraction') {
    const queue = this.getQueue(queueName);
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote não encontrado');
    if (batch.status !== 'PAUSED') {
      throw new BadRequestException(`Lote #${batchId} não está pausado (status: ${batch.status}).`);
    }

    if (queueName === 'formpd-extraction') {
      if (!batch.file_id) throw new BadRequestException('Lote sem file_id — não é possível retomar.');

      // Reconstruct job data from file hub tables
      const fileRow = await (this.prisma as any).files.findUnique({
        where: { id: batch.file_id },
        select: { id: true, storage_key: true, sha256: true },
      });
      if (!fileRow) throw new BadRequestException('Arquivo original não encontrado.');

      const intake = await (this.prisma as any).file_intakes.findFirst({
        where: { file_id: batch.file_id },
        orderBy: { created_at: 'desc' },
        select: { id: true, file_id: true },
      });

      const fileJob = intake ? await (this.prisma as any).file_jobs.findFirst({
        where: { intake_id: intake.id, job_type: 'FORMPD_EXTRACTION' },
        orderBy: { created_at: 'desc' },
        select: { id: true },
      }) : null;

      await queue.add('extract-pdf', {
        batchId: batch.id,
        filePath: fileRow.storage_key,
        sourceCompanyId: batch.company_id ?? null,
        fileHash: fileRow.sha256,
        fileId: fileRow.id,
        intakeId: intake?.id ?? null,
        fileJobId: fileJob?.id ?? null,
      }, { attempts: 3, backoff: { type: 'fixed', delay: 5000 } });
    } else {
      throw new BadRequestException(`Resume automático não suportado para a fila ${queueName}.`);
    }

    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: { status: 'PENDING', updated_at: new Date() },
    });

    return { success: true, batchId, message: 'Lote retomado e reenfileirado.' };
  }

  async retryFailed(batchId: number, queueName: SupportedQueue = 'import-cnpjs') {
    const queue = this.getQueue(queueName);
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote não encontrado');

    const jobName = this.resolveBatchJobName(batch.entity_type);
    const failedItems = await this.prisma.import_items.findMany({
      where: { batch_id: batchId, status: 'ERROR' },
      select: { id: true, record_data: true, file_job_id: true },
      orderBy: { id: 'asc' },
    });

    if (failedItems.length === 0) {
      return {
        success: true,
        queue: queueName,
        batchId,
        retried: 0,
        message: 'Nenhum item ERROR para reprocessar.',
      };
    }

    await this.prisma.import_items.updateMany({
      where: { batch_id: batchId, status: 'ERROR' },
      data: { status: 'PENDING', error_message: null, updated_at: new Date() },
    });

    const jobs = failedItems.map((item) => ({
      name: jobName,
      data: this.buildJobData(batch.entity_type, item, batchId),
      opts: {
        jobId: `manual-retry-failed-b${batchId}-i${item.id}-${Date.now()}`,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    }));

    for (let i = 0; i < jobs.length; i += 500) {
      await queue.addBulk(jobs.slice(i, i + 500));
    }

    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: { status: 'PROCESSING', updated_at: new Date() },
    });

    return {
      success: true,
      queue: queueName,
      batchId,
      retried: jobs.length,
      message: `${jobs.length} itens ERROR reenfileirados como PENDING.`,
    };
  }
}

