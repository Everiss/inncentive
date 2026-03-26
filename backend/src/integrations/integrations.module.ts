import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ImportServiceClient } from './import-service/client';
import { FileHubClientService } from './file-hub/client';
import { ReceitaWsClient } from './receita-ws/client';
import { NotificationServiceClient } from './notification-service/client';
import { PdfExtractorClient } from './pdf-extractor/client';

@Module({
  imports: [HttpModule],
  providers: [
    ImportServiceClient,
    FileHubClientService,
    ReceitaWsClient,
    NotificationServiceClient,
    PdfExtractorClient,
  ],
  exports: [
    ImportServiceClient,
    FileHubClientService,
    ReceitaWsClient,
    NotificationServiceClient,
    PdfExtractorClient,
  ],
})
export class IntegrationsModule {}
