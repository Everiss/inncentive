import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IaConfig } from './ia.config';
import { IaService } from './ia.service';
import { IaPromptService } from './ia-prompt.service';
import { IaExecutionService } from './ia-execution.service';
import { IaAdminController } from './ia.admin.controller';
import { IaBillingController } from './ia.billing.controller';
import { AnthropicProvider } from './providers/anthropic.provider';
/**
 * IaModule — Módulo Global do InnCentive AI Engine.
 *
 * Global: IaService pode ser injetado em qualquer módulo sem imports adicionais.
 * Configuração, prompts e billing são gerenciados via banco de dados.
 * PrismaModule é global — não precisa ser importado aqui.
 */
@Global()
@Module({
  imports: [ConfigModule],
  controllers: [IaAdminController, IaBillingController],
  providers: [
    IaConfig,
    IaPromptService,
    IaExecutionService,
    IaService,
    AnthropicProvider,
  ],
  exports: [IaService, IaConfig, IaPromptService, IaExecutionService],
})
export class IaModule {}
