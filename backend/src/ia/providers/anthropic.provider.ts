import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { IaConfig } from '../ia.config';
import { IaPromptService } from '../ia-prompt.service';
import { IaExecutionService } from '../ia-execution.service';
import { IaRequest, IaResponse, IaTask } from '../ia.types';

@Injectable()
export class AnthropicProvider {
  private readonly logger = new Logger(AnthropicProvider.name);
  private client: Anthropic;

  constructor(
    private readonly iaConfig: IaConfig,
    private readonly promptService: IaPromptService,
    private readonly executionService: IaExecutionService,
  ) {
    const apiKey = this.iaConfig.getApiKey('anthropic');
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY não configurada — provider inativo');
      return;
    }
    this.client = new Anthropic({ apiKey });
  }

  async execute(request: IaRequest): Promise<IaResponse> {
    if (!this.client) {
      throw new Error('Anthropic provider não inicializado: ANTHROPIC_API_KEY ausente');
    }

    const taskConfig = await this.iaConfig.getTaskConfig(request.task);
    const model      = request.overrideModel || taskConfig.model;
    const maxTokens  = taskConfig.maxTokens;
    const startTime  = Date.now();

    const systemPrompt   = await this.resolvePrompt(request.task, 'SYSTEM');
    const messageContent = await this.buildMessageContent(request);

    const requestParams: any = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
    };

    if (taskConfig.extendedThinking) {
      requestParams.thinking = {
        type:          'enabled',
        budget_tokens: taskConfig.thinkingBudget ?? 4000,
      };
    }

    if (taskConfig.temperature !== undefined) {
      requestParams.temperature = taskConfig.temperature;
    }

    let status: 'SUCCESS' | 'ERROR' = 'SUCCESS';
    let errorMessage: string | undefined;
    let response: any;

    try {
      response = await this.client.messages.create(requestParams);
    } catch (error) {
      status       = 'ERROR';
      errorMessage = error.message;
      const latencyMs = Date.now() - startTime;

      await this.executionService.log({
        task: request.task, provider: 'anthropic', model, status, latencyMs,
        errorMessage, companyId: request.context?.companyId,
        module: request.context?.module, referenceId: request.context?.referenceId,
      });

      throw error;
    }

    // Extrai apenas blocos de texto (ignora thinking blocks do Opus)
    const textBlock    = response.content.find((b: any) => b.type === 'text');
    const textResponse = (textBlock as any)?.text ?? '';
    const data         = this.parseJsonResponse(textResponse, request.task);
    const latencyMs    = Date.now() - startTime;
    const inputTokens  = response.usage?.input_tokens;
    const outputTokens = response.usage?.output_tokens;

    await this.executionService.log({
      task: request.task, provider: 'anthropic', model, status,
      inputTokens, outputTokens, latencyMs,
      companyId:   request.context?.companyId,
      module:      request.context?.module,
      referenceId: request.context?.referenceId,
    });

    return { task: request.task, provider: 'anthropic', model, data, latencyMs, tokensUsed: (inputTokens ?? 0) + (outputTokens ?? 0) };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async resolvePrompt(task: IaTask, type: 'SYSTEM' | 'TASK_INSTRUCTION'): Promise<string> {
    const fromDb = await this.promptService.getPrompt(task, type);
    if (fromDb) return fromDb;

    // Fallback: prompt genérico caso o banco não tenha a tarefa ainda
    this.logger.warn(`Prompt [${task}/${type}] não encontrado no banco — usando fallback genérico`);
    return type === 'SYSTEM'
      ? 'Você é um assistente especializado em contabilidade e incentivos fiscais brasileiros. Responda em português e retorne apenas JSON quando solicitado.'
      : `Processe este documento conforme a tarefa ${task} e retorne o resultado em JSON.`;
  }

  private async buildMessageContent(request: IaRequest): Promise<any[]> {
    const content: any[] = [];

    if (request.isPdfBase64) {
      content.push({
        type:   'document',
        source: { type: 'base64', media_type: 'application/pdf', data: request.content },
      });
      const instruction = await this.resolvePrompt(request.task, 'TASK_INSTRUCTION');
      content.push({ type: 'text', text: instruction });
    } else {
      content.push({ type: 'text', text: request.content });
    }

    return content;
  }

  private parseJsonResponse(text: string, task: IaTask): Record<string, any> {
    if (!text?.trim()) {
      this.logger.warn(`Resposta vazia para tarefa ${task}`);
      return { error: 'Resposta vazia', raw: '' };
    }

    try { return JSON.parse(text.trim()); } catch { }

    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fencedMatch) {
      try { return JSON.parse(fencedMatch[1].trim()); } catch { }
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { }
    }

    this.logger.warn(`JSON inválido na resposta para tarefa ${task}`);
    return { error: 'JSON inválido na resposta', raw: text.slice(0, 500) };
  }
}
