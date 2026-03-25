import { Injectable, Logger } from '@nestjs/common';
import { IaConfig } from './ia.config';
import { IaRequest, IaResponse, IaProvider } from './ia.types';
import { AnthropicProvider } from './providers/anthropic.provider';

/**
 * IaService — Orquestrador central de IA.
 *
 * Ponto único de entrada para todas as solicitações de IA.
 * Resolve o provider correto via ia_task_configs (banco) e executa.
 */
@Injectable()
export class IaService {
  private readonly logger = new Logger(IaService.name);

  constructor(
    private readonly iaConfig: IaConfig,
    private readonly anthropicProvider: AnthropicProvider,
  ) {}

  async execute(request: IaRequest): Promise<IaResponse> {
    const taskConfig = await this.iaConfig.getTaskConfig(request.task);
    const provider   = request.overrideProvider || taskConfig.provider;

    this.logger.log(`Iniciando tarefa IA [${request.task}] via provider [${provider}]`);

    try {
      const result = await this.executeByProvider(provider, request);

      this.logger.debug(
        `Tarefa IA [${request.task}] concluída em ${result.latencyMs}ms (Provider: ${result.provider}, Model: ${result.model})`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Erro na tarefa IA [${request.task}] via [${provider}]: ${error.message}`);
      throw error;
    }
  }

  private async executeByProvider(provider: IaProvider, request: IaRequest): Promise<IaResponse> {
    switch (provider) {
      case 'anthropic':
        return this.anthropicProvider.execute(request);
      case 'openai':
        throw new Error('OpenAI provider não implementado ainda');
      case 'gemini':
        throw new Error('Gemini provider não implementado ainda');
      case 'ollama':
        throw new Error('Ollama provider não implementado ainda');
      default:
        throw new Error(`Provider [${provider}] não é suportado pelo motor IA`);
    }
  }
}
