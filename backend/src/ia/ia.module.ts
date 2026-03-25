import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IaConfig } from './ia.config';
import { IaService } from './ia.service';
import { AnthropicProvider } from './providers/anthropic.provider';

/**
 * IaModule — Módulo Global do InnCentive AI Engine.
 * 
 * Este módulo centraliza toda a inteligência artificial do sistema.
 * Ele é global, de modo que o IaService pode ser injetado em qualquer
 * outro módulo (imports, formpd, etc.) sem complicações.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    IaConfig,
    IaService,
    AnthropicProvider,
    // Adicione novos providers aqui à medida que forem implementados
  ],
  exports: [IaService],
})
export class IaModule {}
