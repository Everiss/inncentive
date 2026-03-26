import { Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { QueueAdminService } from './queue-admin.service';

@Controller('queue-admin')
export class QueueAdminController {
  constructor(private readonly queueAdminService: QueueAdminService) {}

  @Get('queues/:name/status')
  async getQueueStatus(@Param('name') name: 'import-cnpjs' | 'formpd-extraction') {
    return this.queueAdminService.getQueueStatus(name);
  }

  @Post('queues/:name/pause')
  async pauseQueue(@Param('name') name: 'import-cnpjs' | 'formpd-extraction') {
    return this.queueAdminService.pauseQueue(name);
  }

  @Post('queues/:name/resume')
  async resumeQueue(@Param('name') name: 'import-cnpjs' | 'formpd-extraction') {
    return this.queueAdminService.resumeQueue(name);
  }

  @Post('batches/:id/requeue-pending')
  async requeuePending(
    @Param('id', ParseIntPipe) id: number,
    @Query('queue') queue?: 'import-cnpjs' | 'formpd-extraction',
  ) {
    return this.queueAdminService.requeuePending(id, queue ?? 'import-cnpjs');
  }

  @Post('batches/:id/retry-failed')
  async retryFailed(
    @Param('id', ParseIntPipe) id: number,
    @Query('queue') queue?: 'import-cnpjs' | 'formpd-extraction',
  ) {
    return this.queueAdminService.retryFailed(id, queue ?? 'import-cnpjs');
  }
}

