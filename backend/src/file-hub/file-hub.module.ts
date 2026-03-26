import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FileHubService } from './file-hub.service';

@Module({
  imports: [PrismaModule],
  providers: [FileHubService],
  exports: [FileHubService],
})
export class FileHubModule {}

