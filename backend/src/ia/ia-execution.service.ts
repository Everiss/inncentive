import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IaTask } from './ia.types';

export interface LogExecutionDto {
  task: IaTask;
  provider: string;
  model: string;
  status: 'SUCCESS' | 'ERROR' | 'TIMEOUT';
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  errorMessage?: string;
  companyId?: number;
  module?: string;
  referenceId?: string;
}

interface PricingCacheEntry {
  inputCost: number;   // USD por 1M tokens
  outputCost: number;
  expiresAt: number;
}

@Injectable()
export class IaExecutionService {
  private readonly logger = new Logger(IaExecutionService.name);
  private readonly pricingCache = new Map<string, PricingCacheEntry>();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

  constructor(private readonly prisma: PrismaService) {}

  async log(dto: LogExecutionDto): Promise<void> {
    try {
      const costUsd = await this.calculateCost(dto.provider, dto.model, dto.inputTokens, dto.outputTokens);

      await this.prisma.ia_executions.create({
        data: {
          task:          dto.task,
          provider:      dto.provider,
          model:         dto.model,
          status:        dto.status,
          input_tokens:  dto.inputTokens,
          output_tokens: dto.outputTokens,
          latency_ms:    dto.latencyMs,
          cost_usd:      costUsd,
          error_message: dto.errorMessage,
          company_id:    dto.companyId,
          module:        dto.module,
          reference_id:  dto.referenceId,
        },
      });
    } catch (error) {
      // Nunca deixar falha no log quebrar o fluxo principal
      this.logger.error(`Falha ao registrar execução IA: ${error.message}`);
    }
  }

  // ── Billing queries ────────────────────────────────────────────────────────

  async getSummary(from: Date, to: Date) {
    const rows = await this.prisma.ia_executions.groupBy({
      by: ['task', 'model', 'status'],
      where: { created_at: { gte: from, lte: to } },
      _count: { id: true },
      _sum: { input_tokens: true, output_tokens: true, cost_usd: true, latency_ms: true },
    });

    return rows.map((r) => ({
      task:          r.task,
      model:         r.model,
      status:        r.status,
      executions:    r._count.id,
      input_tokens:  r._sum.input_tokens ?? 0,
      output_tokens: r._sum.output_tokens ?? 0,
      total_cost_usd: Number(r._sum.cost_usd ?? 0).toFixed(4),
      avg_latency_ms: r._count.id > 0 ? Math.round((r._sum.latency_ms ?? 0) / r._count.id) : 0,
    }));
  }

  async getSummaryByCompany(from: Date, to: Date) {
    const rows = await this.prisma.ia_executions.groupBy({
      by: ['company_id', 'task'],
      where: { created_at: { gte: from, lte: to }, company_id: { not: null } },
      _count: { id: true },
      _sum: { cost_usd: true, input_tokens: true, output_tokens: true },
    });

    return rows.map((r) => ({
      company_id:     r.company_id,
      task:           r.task,
      executions:     r._count.id,
      input_tokens:   r._sum.input_tokens ?? 0,
      output_tokens:  r._sum.output_tokens ?? 0,
      total_cost_usd: Number(r._sum.cost_usd ?? 0).toFixed(4),
    }));
  }

  async getMonthly(months = 12) {
    const from = new Date();
    from.setMonth(from.getMonth() - months);

    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') AS month,
        task,
        model,
        COUNT(*) AS executions,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cost_usd) AS total_cost_usd
      FROM ia_executions
      WHERE created_at >= ${from}
      GROUP BY DATE_FORMAT(created_at, '%Y-%m'), task, model
      ORDER BY month DESC, task
    `;

    return rows.map((r) => ({ ...r, total_cost_usd: Number(r.total_cost_usd ?? 0).toFixed(4) }));
  }

  async getExecutions(filters: { task?: string; status?: string; companyId?: number; limit?: number }) {
    return this.prisma.ia_executions.findMany({
      where: {
        ...(filters.task      && { task: filters.task }),
        ...(filters.status    && { status: filters.status }),
        ...(filters.companyId && { company_id: filters.companyId }),
      },
      orderBy: { created_at: 'desc' },
      take: filters.limit ?? 100,
    });
  }

  // ── Cálculo de custo ───────────────────────────────────────────────────────

  private async calculateCost(
    provider: string,
    model: string,
    inputTokens?: number,
    outputTokens?: number,
  ): Promise<number | null> {
    if (!inputTokens && !outputTokens) return null;

    const pricing = await this.getPricing(provider, model);
    if (!pricing) return null;

    const inputCost  = ((inputTokens  ?? 0) / 1_000_000) * pricing.inputCost;
    const outputCost = ((outputTokens ?? 0) / 1_000_000) * pricing.outputCost;
    return inputCost + outputCost;
  }

  private async getPricing(provider: string, model: string): Promise<{ inputCost: number; outputCost: number } | null> {
    const key = `${provider}:${model}`;
    const cached = this.pricingCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { inputCost: cached.inputCost, outputCost: cached.outputCost };
    }

    const now = new Date();
    const pricing = await this.prisma.ia_model_pricing.findFirst({
      where: {
        provider,
        model,
        valid_from: { lte: now },
        OR: [{ valid_to: null }, { valid_to: { gt: now } }],
      },
      orderBy: { valid_from: 'desc' },
    });

    if (!pricing) return null;

    const entry: PricingCacheEntry = {
      inputCost:  Number(pricing.input_cost_per_1m_tokens),
      outputCost: Number(pricing.output_cost_per_1m_tokens),
      expiresAt:  Date.now() + this.CACHE_TTL_MS,
    };
    this.pricingCache.set(key, entry);
    return { inputCost: entry.inputCost, outputCost: entry.outputCost };
  }
}
