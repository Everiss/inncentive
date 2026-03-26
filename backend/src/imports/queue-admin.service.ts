import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { FileHubClientService } from '../integrations/file-hub/client';

type SupportedQueue = 'import-cnpjs' | 'formpd-extraction';

@Injectable()
export class QueueAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileHubService: FileHubClientService,
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
        throw new BadRequestException(`Fila nao suportada: ${queueName}`);
    }
  }

  private resolveBatchJobName(entityType: string): string {
    if (entityType === 'COMPANIES') return 'process-cnpj';
    if (entityType === 'CONTACTS') return 'process-contact';
    if (entityType === 'COLLABORATORS') return 'process-collaborator';
    if (entityType === 'PROJECTS') return 'process-project';
    throw new BadRequestException(`Entity type ${entityType} nao e suportado para requeue nesta fila.`);
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
    if (entityType === 'CONTACTS' || entityType === 'COLLABORATORS' || entityType === 'PROJECTS') {
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
    if (!batch) throw new NotFoundException('Lote nao encontrado');

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

  async pauseBatchJob(batchId: number, queueName: SupportedQueue = 'formpd-extraction') {
    const queue = this.getQueue(queueName);
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote nao encontrado');

    const [waitingJobs, activeJobs] = await Promise.all([queue.getWaiting(), queue.getActive()]);
    const allJobs = [...waitingJobs, ...activeJobs];
    const batchJob = allJobs.find((j) => j.data?.batchId === batchId);

    if (batchJob) {
      await batchJob.remove();
    }

    await this.prisma.import_batches.update({
      where: { id: batchId },
      data: { status: 'PAUSED', updated_at: new Date() },
    });

    return { success: true, batchId, message: 'Lote pausado. Job removido da fila.' };
  }

  async resumeBatchJob(batchId: number, queueName: SupportedQueue = 'formpd-extraction') {
    const queue = this.getQueue(queueName);
    const batch = await this.prisma.import_batches.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote nao encontrado');
    if (batch.status !== 'PAUSED') {
      throw new BadRequestException(`Lote #${batchId} nao esta pausado (status: ${batch.status}).`);
    }

    if (queueName === 'formpd-extraction') {
      if (!batch.file_id) throw new BadRequestException('Lote sem file_id - nao e possivel retomar.');

      const fileRow = await this.fileHubService.getFileById(batch.file_id);
      if (!fileRow) throw new BadRequestException('Arquivo original nao encontrado.');

      const intake = await this.fileHubService.getLatestIntake(batch.file_id);
      const fileJob = intake
        ? await this.fileHubService.getLatestJobByIntake(intake.id, 'FORMPD_EXTRACTION')
        : null;

      await queue.add(
        'extract-pdf',
        {
          batchId: batch.id,
          filePath: fileRow.storage_key,
          sourceCompanyId: batch.company_id ?? null,
          fileHash: fileRow.sha256,
          fileId: fileRow.id,
          intakeId: intake?.id ?? null,
          fileJobId: fileJob?.id ?? null,
        },
        { attempts: 3, backoff: { type: 'fixed', delay: 5000 } },
      );
    } else {
      throw new BadRequestException(`Resume automatico nao suportado para a fila ${queueName}.`);
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
    if (!batch) throw new NotFoundException('Lote nao encontrado');

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

