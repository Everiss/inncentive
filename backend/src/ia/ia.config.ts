import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IaProvider, IaTask } from './ia.types';

export interface IaTaskConfig {
  provider: IaProvider;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export type IaTaskConfigMap = Record<IaTask, IaTaskConfig>;

/**
 * IaConfig — Mapa de Provider+Model por Tarefa.
 *
 * Para trocar o LLM de qualquer funcionalidade do sistema,
 * basta editar o entry correspondente neste arquivo.
 * Nenhuma outra parte do código precisa ser alterada.
 *
 * Estratégia de modelos:
 *   claude-opus-4-6    → Raciocínio profundo: narrativa FORMP&D, contestação MCTI
 *   claude-sonnet-4-6  → Equilíbrio custo/qualidade: OCR folha, análise parecer, cruzamento ECD
 *   claude-haiku-4-5   → Alto volume, baixo custo: batch elegibilidade, classificação, alocação RH
 */
@Injectable()
export class IaConfig {
  private readonly taskMap: IaTaskConfigMap;

  constructor(private readonly config: ConfigService) {
    this.taskMap = {

      // ── Extração de Documentos ───────────────────────────────────────────
      // Sonnet: OCR de folha PDF — equilíbrio perfeito entre acurácia e custo.
      // Usa PDF nativo (sem beta header) + prompt caching no system prompt.
      FORMPD_EXTRACTION: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        maxTokens: 4096,
      },

      // Haiku: alto volume de folhas — extração estruturada de PDFs simples.
      PAYROLL_EXTRACTION: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        maxTokens: 4096,
      },

      // Haiku: leitura de NF-e (XML ou imagem) para classificação de ativo.
      NF_EXTRACTION: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        maxTokens: 2048,
      },

      // ── Classificação e Curadoria ────────────────────────────────────────
      // Haiku: processado via Batch API (50% desconto) para catálogos grandes.
      // Tool use com structured output — retorna is_eligible + basis + confidence.
      RUBRIC_CLASSIFICATION: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        maxTokens: 1024,
        temperature: 0.0, // Determinístico para classificação
      },

      // Haiku: classificação de timesheets por atividade PD&I em lote.
      TIMESHEET_CLASSIFICATION: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        maxTokens: 1024,
        temperature: 0.0,
      },

      // ── Geração de Conteúdo ──────────────────────────────────────────────
      // Opus: narrativa técnica FORMP&D e contestações — máxima qualidade.
      // Extended thinking habilitado no provider para raciocínio antes de redigir.
      PROJECT_DESCRIPTION: {
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        maxTokens: 8000,
        temperature: 0.7,
      },
    };
  }

  getTaskConfig(task: IaTask): IaTaskConfig {
    const config = this.taskMap[task];
    if (!config) throw new Error(`Tarefa IA não configurada: ${task}`);
    return config;
  }

  getApiKey(provider: IaProvider): string | undefined {
    const keyMap: Record<IaProvider, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',   // reservado para uso futuro
      gemini: 'GEMINI_API_KEY',   // reservado para uso futuro
      ollama: 'OLLAMA_HOST',      // reservado para uso futuro
    };
    return this.config.get<string>(keyMap[provider]);
  }

  isProviderConfigured(provider: IaProvider): boolean {
    return !!this.getApiKey(provider);
  }
}