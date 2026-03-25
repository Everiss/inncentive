/**
 * Módulo IA — InnCentive AI Engine
 *
 * Motor centralizado de Inteligência Artificial do sistema.
 * Suporta múltiplos providers (Anthropic, OpenAI, Gemini, Ollama)
 * via Strategy Pattern, configurável por tarefa — sem acoplamento.
 */

// ─── Providers suportados ──────────────────────────────────────────────────
export type IaProvider = 'anthropic' | 'openai' | 'gemini' | 'ollama';

// ─── Tarefas registradas (cada uma pode ter seu próprio provider/model) ────
export type IaTask =
  | 'FORMPD_EXTRACTION'        // Extrai dados do formulário FORMP&D (PDF)
  | 'PAYROLL_EXTRACTION'       // Extrai folha de pagamento de PDF/CSV não estruturado
  | 'NF_EXTRACTION'            // Extrai dados de Nota Fiscal (PDF/XML)
  | 'RUBRIC_CLASSIFICATION'    // Classifica rubricas p/ elegibilidade Lei do Bem
  | 'PROJECT_DESCRIPTION'      // Sugere descrição técnica para projetos PD&I
  | 'TIMESHEET_CLASSIFICATION';// Classifica registros de horas por atividade PD&I

// ─── Request ao motor de IA ────────────────────────────────────────────────
export interface IaRequest {
  task: IaTask;
  /** Conteúdo a analisar: texto, JSON stringificado ou PDF em base64 */
  content: string;
  /** Se o conteúdo é um PDF em base64 */
  isPdfBase64?: boolean;
  /** Contexto adicional para o prompt (ex: ano-base, CNPJ da empresa) */
  context?: Record<string, any>;
  /** Força um provider específico para esta execução (opcional) */
  overrideProvider?: IaProvider;
  /** Força um modelo específico (opcional) */
  overrideModel?: string;
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
  /** Tokens consumidos (quando disponível) */
  tokensUsed?: number;
}
