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
      const fullInstruction = request.contextHint
        ? `${request.contextHint}\n\n${instruction}`
        : instruction;
      content.push({ type: 'text', text: fullInstruction });
    } else {
      const baseInstruction = await this.resolvePrompt(request.task, 'TASK_INSTRUCTION');
      const instruction     = this.buildChunkInstruction(baseInstruction, request.chunkContext);
      const hintPrefix      = request.contextHint ? `${request.contextHint}\n\n` : '';
      content.push({ type: 'text', text: `${hintPrefix}${instruction}\n\n---\n\n${request.content}` });
    }

    return content;
  }

  /**
   * Adapts the task instruction when the document is split into chunks.
   * For single documents, returns the base instruction unchanged.
   */
  private buildChunkInstruction(
    base: string,
    chunk?: { index: number; total: number },
  ): string {
    if (!chunk || chunk.total === 1) return base;

    const position = chunk.index === 0
      ? 'TRECHO INICIAL (primeira parte)'
      : chunk.index === chunk.total - 1
        ? 'TRECHO FINAL (última parte)'
        : `TRECHO INTERMEDIÁRIO (parte ${chunk.index + 1} de ${chunk.total})`;

    return (
      `ATENÇÃO: Este é o ${position} de um documento dividido em ${chunk.total} trechos por ser muito extenso.\n` +
      `Extraia TODOS os dados disponíveis neste trecho. Para campos não encontrados nesta parte, use null.\n` +
      `Os resultados de todos os trechos serão mesclados automaticamente.\n\n` +
      base
    );
  }

  private parseJsonResponse(text: string, task: IaTask): Record<string, any> {
    if (!text?.trim()) {
      this.logger.warn(`Resposta vazia para tarefa ${task}`);
      return { error: 'Resposta vazia', raw: '' };
    }

    // 1. Direct parse
    try { return JSON.parse(text.trim()); } catch { }

    // 2. Fenced code block
    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fencedMatch) {
      try { return JSON.parse(fencedMatch[1].trim()); } catch { }
    }

    // 3. First complete JSON object in text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { }
    }

    // 4. Truncation recovery — if response was cut off by max_tokens,
    //    try to close open brackets so we salvage what was extracted
    const start = text.indexOf('{');
    if (start !== -1) {
      const partial = text.slice(start);
      const recovered = this.repairTruncatedJson(partial);
      if (recovered) {
        this.logger.warn(`JSON truncado recuperado para tarefa ${task} (${partial.length} chars)`);
        return recovered;
      }
    }

    this.logger.warn(`JSON inválido na resposta para tarefa ${task}`);
    return { error: 'JSON inválido na resposta', raw: text.slice(0, 500) };
  }

  /**
   * Attempts to close a truncated JSON object by counting open brackets/braces
   * and appending the minimum closing sequence. Returns null if irrecoverable.
   */
  private repairTruncatedJson(partial: string): Record<string, any> | null {
    // Remove trailing incomplete string or key
    let s = partial.trimEnd();

    // Drop trailing comma
    if (s.endsWith(',')) s = s.slice(0, -1);

    // Drop incomplete string (unclosed quote at the end)
    const lastQuote = s.lastIndexOf('"');
    if (lastQuote !== -1) {
      const afterLastQuote = s.slice(lastQuote + 1);
      // If no closing quote after the last opening quote, it's truncated
      if (!afterLastQuote.includes('"')) {
        s = s.slice(0, lastQuote);
        if (s.endsWith(':')) s = s.slice(0, -1); // drop orphaned key
        if (s.endsWith(',')) s = s.slice(0, -1);
      }
    }

    // Count unclosed braces and brackets
    let braces = 0, brackets = 0;
    let inStr = false, escaped = false;
    for (const ch of s) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && inStr) { escaped = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === '[') brackets++;
      else if (ch === ']') brackets--;
    }

    if (braces <= 0 && brackets <= 0) return null; // nothing to close

    const closing = ']'.repeat(Math.max(0, brackets)) + '}'.repeat(Math.max(0, braces));
    try {
      return JSON.parse(s + closing);
    } catch {
      return null;
    }
  }
}
