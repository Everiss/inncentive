import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { IaProvider, IaTask } from './ia.types';

export interface IaTaskConfig {
  provider: IaProvider;
  model: string;
  maxTokens: number;
  temperature?: number;
  extendedThinking: boolean;
  thinkingBudget?: number;
}

interface CacheEntry {
  config: IaTaskConfig;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

@Injectable()
export class IaConfig implements OnModuleInit {
  private readonly logger = new Logger(IaConfig.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.warmUpCache();
  }

  async getTaskConfig(task: IaTask): Promise<IaTaskConfig> {
    const cached = this.cache.get(task);
    if (cached && cached.expiresAt > Date.now()) return cached.config;

    const row = await this.prisma.ia_task_configs.findFirst({
      where: { task, is_active: true },
    });

    if (!row) {
      throw new Error(`Tarefa IA não configurada no banco: ${task}`);
    }

    const config: IaTaskConfig = {
      provider:         row.provider as IaProvider,
      model:            row.model,
      maxTokens:        row.max_tokens,
      temperature:      row.temperature ?? undefined,
      extendedThinking: row.extended_thinking,
      thinkingBudget:   row.thinking_budget ?? undefined,
    };

    this.cache.set(task, { config, expiresAt: Date.now() + CACHE_TTL_MS });
    return config;
  }

  invalidateCache(task?: IaTask) {
    if (task) {
      this.cache.delete(task);
    } else {
      this.cache.clear();
    }
  }

  // ── Admin: CRUD de task configs ────────────────────────────────────────────

  async listAll() {
    return this.prisma.ia_task_configs.findMany({ orderBy: { task: 'asc' } });
  }

  async update(task: IaTask, data: Partial<{
    provider: string; model: string; maxTokens: number;
    temperature: number | null; extendedThinking: boolean;
    thinkingBudget: number | null; isActive: boolean;
  }>, updatedBy?: number) {
    const updated = await this.prisma.ia_task_configs.update({
      where: { task },
      data: {
        ...(data.provider         !== undefined && { provider: data.provider }),
        ...(data.model            !== undefined && { model: data.model }),
        ...(data.maxTokens        !== undefined && { max_tokens: data.maxTokens }),
        ...(data.temperature      !== undefined && { temperature: data.temperature }),
        ...(data.extendedThinking !== undefined && { extended_thinking: data.extendedThinking }),
        ...(data.thinkingBudget   !== undefined && { thinking_budget: data.thinkingBudget }),
        ...(data.isActive         !== undefined && { is_active: data.isActive }),
        updated_by: updatedBy,
      },
    });

    this.invalidateCache(task);
    this.logger.log(`Configuração da tarefa [${task}] atualizada: model=${updated.model}`);
    return updated;
  }

  // ── API keys ───────────────────────────────────────────────────────────────

  getApiKey(provider: IaProvider): string | undefined {
    const keyMap: Record<IaProvider, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai:    'OPENAI_API_KEY',
      gemini:    'GEMINI_API_KEY',
      ollama:    'OLLAMA_HOST',
    };
    return this.configService.get<string>(keyMap[provider]);
  }

  isProviderConfigured(provider: IaProvider): boolean {
    return !!this.getApiKey(provider);
  }

  // ── Privado ────────────────────────────────────────────────────────────────

  private async warmUpCache() {
    try {
      const rows = await this.prisma.ia_task_configs.findMany({ where: { is_active: true } });
      for (const row of rows) {
        const config: IaTaskConfig = {
          provider:         row.provider as IaProvider,
          model:            row.model,
          maxTokens:        row.max_tokens,
          temperature:      row.temperature ?? undefined,
          extendedThinking: row.extended_thinking,
          thinkingBudget:   row.thinking_budget ?? undefined,
        };
        this.cache.set(row.task, { config, expiresAt: Date.now() + CACHE_TTL_MS });
      }
      this.logger.log(`Cache de task configs aquecido: ${rows.length} tarefas`);
    } catch {
      this.logger.warn('Falha ao aquecer cache de task configs — banco pode estar indisponível');
    }
  }
}
