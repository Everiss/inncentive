/**
 * Módulo IA — InnCentive AI Engine
 *
 * Motor centralizado de Inteligência Artificial do sistema.
 * Suporta múltiplos providers (Anthropic, OpenAI, Gemini, Ollama)
 * via Strategy Pattern, configurável por tarefa via banco de dados.
 */

// ─── Providers suportados ──────────────────────────────────────────────────
export type IaProvider = 'anthropic' | 'openai' | 'gemini' | 'ollama';

// ─── Tarefas registradas (cada uma tem config e prompts no banco) ──────────
export type IaTask =
  | 'FORMPD_EXTRACTION'         // Extrai dados do formulário FORMP&D (PDF)
  | 'PAYROLL_EXTRACTION'        // Extrai folha de pagamento de PDF/CSV não estruturado
  | 'NF_EXTRACTION'             // Extrai dados de Nota Fiscal (PDF/XML)
  | 'RUBRIC_CLASSIFICATION'     // Classifica rubricas p/ elegibilidade Lei do Bem
  | 'PROJECT_DESCRIPTION'       // Sugere descrição técnica para projetos PD&I
  | 'TIMESHEET_CLASSIFICATION'; // Classifica registros de horas por atividade PD&I

// ─── Contexto de negócio (para log de execução e billing) ─────────────────
export interface IaExecutionContext {
  /** ID da empresa para atribuição de custo por cliente */
  companyId?: number;
  /** Módulo de origem: imports | formpd | payroll | projects | etc. */
  module?: string;
  /** ID do registro processado (import_item_id, formpd_form_id, etc.) */
  referenceId?: string;
  /** Dados extras para o prompt (ano-base, CNPJ, etc.) */
  [key: string]: any;
}

// ─── Request ao motor de IA ────────────────────────────────────────────────
export interface IaRequest {
  task: IaTask;
  /** Conteúdo a analisar: texto, JSON stringificado ou PDF em base64 */
  content: string;
  /** Se o conteúdo é um PDF em base64 */
  isPdfBase64?: boolean;
  /** Contexto de negócio: usado para billing e como variáveis no prompt */
  context?: IaExecutionContext;
  /** Força um provider específico para esta execução (opcional) */
  overrideProvider?: IaProvider;
  /** Força um modelo específico (opcional) */
  overrideModel?: string;
  /**
   * Contexto de chunking para documentos grandes divididos em partes.
   * O provider usa isso para ajustar a instrução de cada trecho.
   */
  chunkContext?: { index: number; total: number };
}

// ─── Resposta do motor de IA ───────────────────────────────────────────────
export interface IaResponse {
  task: IaTask;
  provider: IaProvider;
  model: string;
  /** JSON estruturado extraído/gerado pela IA */
  data: Record<string, any>;
  /** Tempo de resposta em ms */
  latencyMs: number;
  /** Tokens consumidos (input + output) */
  tokensUsed?: number;
}
