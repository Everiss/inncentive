import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { IaConfig } from '../ia.config';
import { IaRequest, IaResponse, IaTask } from '../ia.types';

@Injectable()
export class AnthropicProvider {
  private readonly logger = new Logger(AnthropicProvider.name);
  private client: Anthropic;

  constructor(private readonly iaConfig: IaConfig) {
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

    const taskConfig = this.iaConfig.getTaskConfig(request.task);
    const model = request.overrideModel || taskConfig.model;
    const maxTokens = taskConfig.maxTokens || 4096;
    const startTime = Date.now();

    const systemPrompt = this.getSystemPrompt(request.task, request.context);
    const messageContent = this.buildMessageContent(request);

    // Extended thinking habilitado apenas para tarefas que exigem raciocínio profundo
    const needsThinking = request.task === 'PROJECT_DESCRIPTION';

    const requestParams: any = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
    };

    if (needsThinking) {
      requestParams.thinking = { type: 'enabled', budget_tokens: 4000 };
    }

    const response = await this.client.messages.create(requestParams);

    // Extrai apenas blocos de texto (ignora thinking blocks do Opus)
    const textBlock = response.content.find((b: any) => b.type === 'text');
    const textResponse: string = (textBlock as any)?.text ?? '';

    const data = this.parseJsonResponse(textResponse, request.task);

    return {
      task: request.task,
      provider: 'anthropic',
      model,
      data,
      latencyMs: Date.now() - startTime,
      tokensUsed: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
    };
  }

  // ── Message content builder ────────────────────────────────────────────────

  private buildMessageContent(request: IaRequest): any[] {
    const content: any[] = [];

    if (request.isPdfBase64) {
      // PDF nativo — sem beta header necessário nos modelos Claude 4.x e Haiku 4.5
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: request.content,
        },
      });
      content.push({
        type: 'text',
        text: this.getTaskInstruction(request.task, request.context),
      });
    } else {
      content.push({ type: 'text', text: request.content });
    }

    return content;
  }

  // ── System prompts por IaTask ──────────────────────────────────────────────

  private getSystemPrompt(task: IaTask, context?: Record<string, any>): string {
    switch (task) {

      // ── M3: OCR de Folha de Pagamento ───────────────────────────────────
      case 'PAYROLL_EXTRACTION':
        return `Você é especialista em folha de pagamento e obrigações trabalhistas brasileiras.
Extraia com precisão absoluta todos os dados de uma ficha de pagamento/holerite.
Retorne APENAS um JSON válido, sem markdown, sem texto adicional.

Estrutura obrigatória:
{
  "competence_year": number,
  "competence_month": number,
  "collaborator": { "name": string, "cpf": string|null, "registration": string|null },
  "sheet_type": "MENSAL"|"DECIMO_TERCEIRO_1PARCELA"|"DECIMO_TERCEIRO_2PARCELA"|"FERIAS"|"RESCISAO"|"COMPLEMENTAR",
  "gross_amount": number,
  "net_amount": number,
  "total_discounts": number,
  "items": [
    {
      "code": string,
      "description": string,
      "type": "PROVENTO"|"DESCONTO"|"ENCARGO_PATRONAL"|"INFORMATIVO",
      "reference_value": number|null,
      "reference_unit": string|null,
      "amount": number
    }
  ],
  "employer_charges": {
    "inss_patronal": number, "fgts": number, "rat_sat": number,
    "terceiros": number, "vale_transporte": number, "vale_refeicao": number
  }|null
}`;

      // ── M6: Extração de FORMP&D PDF ──────────────────────────────────────
      case 'FORMPD_EXTRACTION':
        return `Você é especialista em incentivos fiscais da Lei do Bem (Lei nº 11.196/2005) e nos formulários FORMP&D do MCTI.
Extraia dados estruturados de um formulário FORMP&D em PDF.
Retorne APENAS um JSON válido, sem markdown, sem texto adicional.

Estrutura obrigatória:
{
  "company_info": { "cnpj": string, "legal_name": string },
  "fiscal_year": number,
  "fiscal_loss": boolean,
  "fiscal_loss_amount": number|null,
  "projects": [
    {
      "title": string,
      "description": string,
      "category": "PESQUISA_BASICA"|"PESQUISA_APLICADA"|"DESENVOLVIMENTO_EXPERIMENTAL"|"INOVACAO_TECNOLOGICA",
      "tech_area_code": string|null,
      "tech_area_label": string|null,
      "is_continuous": boolean,
      "start_date": string|null,
      "end_date": string|null,
      "human_resources": [
        { "name": string, "cpf": string|null, "role": string|null, "dedication_pct": number|null, "annual_amount": number|null }
      ],
      "expenses": [{ "category": string, "description": string|null, "amount": number }]
    }
  ],
  "fiscal_summary": {
    "total_rnd_expenditure": number,
    "total_benefit_requested": number,
    "ir_deduction_pct": number|null
  }
}`;

      // ── M2: Extração de NF-e para classificação de ativo ─────────────────
      case 'NF_EXTRACTION':
        return `Você é especialista em classificação fiscal de bens do ativo imobilizado para fins de Lei do Bem.
Dado um documento fiscal (NF-e, NFS-e ou imagem de nota), extraia os dados e classifique o bem.
Retorne APENAS um JSON válido, sem markdown, sem texto adicional.

Estrutura obrigatória:
{
  "doc_type": "NFE"|"NFSE"|"OUTRO",
  "doc_number": string|null,
  "supplier_cnpj": string|null,
  "supplier_name": string|null,
  "issue_date": string,
  "total_amount": number,
  "items": [
    { "description": string, "ncm_code": string|null, "quantity": number, "unit_value": number, "total_value": number }
  ],
  "asset_classification": {
    "asset_type": "EQUIPAMENTO_NACIONAL"|"EQUIPAMENTO_IMPORTADO"|"SOFTWARE"|"LICENCA_TECNOLOGIA"|"OUTRO_INTANGIVEL",
    "usage_type": "EXCLUSIVO_PDI"|"MISTO"|"NAO_PDI",
    "depreciation_method": "LINEAR"|"ACELERADA_INTEGRAL"|"ACELERADA_PDI",
    "useful_life_years": number,
    "is_eligible_rdi": boolean,
    "rdi_usage_pct": number,
    "justification": string,
    "confidence": "alta"|"media"|"baixa"
  }
}`;

      // ── M4: Elegibilidade de Rubricas ────────────────────────────────────
      case 'RUBRIC_CLASSIFICATION':
        return `Você é especialista em legislação trabalhista e no programa Lei do Bem (Lei nº 11.196/2005, Decreto 5.798/2006).
Classifique rubricas de folha de pagamento quanto à elegibilidade para o programa PD&I.
Retorne APENAS um JSON válido, sem markdown, sem texto adicional.

Critérios:
- ELEGÍVEIS: salário base, horas extras, adicionais (noturno, periculosidade, insalubridade), encargos patronais (INSS, FGTS, RAT, Terceiros, VT, VR), 13º salário, férias
- NÃO ELEGÍVEIS: INSS do empregado, IRRF, adiantamentos, empréstimos, descontos
- AVALIAR CASO A CASO: PLR, bônus, comissões, benefícios

Fundamentar sempre com artigo da Lei 11.196/2005 ou Portaria MCTI.

Estrutura:
{
  "is_eligible": boolean,
  "eligibility_basis": string,
  "confidence": "alta"|"media"|"baixa",
  "recommended_nature": string|null
}`;

      // ── M4: Classificação de Timesheets ──────────────────────────────────
      case 'TIMESHEET_CLASSIFICATION':
        return `Você é especialista em gestão de projetos PD&I e no programa Lei do Bem.
Analise registros de horas e classifique atividades quanto à elegibilidade para PD&I.
Retorne APENAS um JSON válido, sem markdown, sem texto adicional.

ELEGÍVEIS: pesquisa, desenvolvimento experimental, prototipagem, testes técnicos, documentação técnica PD&I, gestão direta de projeto PD&I.
NÃO ELEGÍVEIS: vendas, suporte comercial, reuniões administrativas, treinamentos gerais, manutenção de sistemas em produção.

Estrutura:
{
  "is_eligible_pdi": boolean,
  "activity_classification": string,
  "confidence": "alta"|"media"|"baixa",
  "notes": string|null
}`;

      // ── M6: Elaboração de narrativa técnica FORMP&D ──────────────────────
      case 'PROJECT_DESCRIPTION':
        return `Você é especialista sênior em Lei do Bem (Lei nº 11.196/2005) e na elaboração de projetos PD&I para o FORMP&D do MCTI.
Redija a descrição técnica do projeto seguindo rigorosamente os critérios de aprovação do MCTI.

Critérios obrigatórios (Art. 2º Lei 10.973/2004):
1. NOVIDADE TECNOLÓGICA: avanço técnico-científico, não apenas otimização de processos
2. RISCO E INCERTEZA: incerteza técnica ou científica sobre o resultado
3. SISTEMATIZAÇÃO: atividade planejada e documentada
4. REPRODUTIBILIDADE: metodologia descrita de forma replicável

Retorne APENAS um JSON válido:
{
  "description": string,
  "key_innovations": string[],
  "objectives": string[],
  "methodology_summary": string
}`;

      default:
        return 'Você é um assistente especializado em contabilidade e incentivos fiscais brasileiros. Responda em português e retorne apenas JSON quando solicitado.';
    }
  }

  private getTaskInstruction(task: IaTask, context?: Record<string, any>): string {
    switch (task) {
      case 'PAYROLL_EXTRACTION':
        return 'Extraia todos os dados desta ficha de pagamento e retorne no formato JSON especificado.';
      case 'FORMPD_EXTRACTION':
        return `Extraia todos os dados deste formulário FORMP&D e retorne no formato JSON especificado.${context?.baseYear ? ` Ano-base esperado: ${context.baseYear}.` : ''
          }`;
      case 'NF_EXTRACTION':
        return 'Extraia os dados desta nota fiscal e classifique o bem adquirido. Retorne no formato JSON especificado.';
      default:
        return `Processe este documento conforme a tarefa ${task} e retorne o resultado em JSON.`;
    }
  }

  // ── JSON parser robusto ────────────────────────────────────────────────────

  private parseJsonResponse(text: string, task: IaTask): Record<string, any> {
    if (!text?.trim()) {
      this.logger.warn(`Resposta vazia para tarefa ${task}`);
      return { error: 'Resposta vazia', raw: '' };
    }

    // 1. Parse direto
    try { return JSON.parse(text.trim()); } catch { }

    // 2. Extrai bloco fenced markdown ```json ... ```
    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fencedMatch) {
      try { return JSON.parse(fencedMatch[1].trim()); } catch { }
    }

    // 3. Maior objeto JSON no texto
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { }
    }

    this.logger.warn(`JSON inválido na resposta para tarefa ${task}`);
    return { error: 'JSON inválido na resposta', raw: text.slice(0, 500) };
  }
}