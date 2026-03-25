/**
 * Seed: Módulo IA
 *
 * Popula as tabelas de configuração do motor IA:
 *   - ia_task_configs   → provider/model por tarefa
 *   - ia_prompts        → system prompts e task instructions (v1)
 *   - ia_model_pricing  → preços Anthropic vigentes (Mar/2026)
 *
 * Execução: npx ts-node prisma/seed-ia.ts
 * Ou via: npx prisma db seed (configurar package.json se necessário)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Configurações de tarefas ──────────────────────────────────────────────

const taskConfigs = [
  {
    task:              'FORMPD_EXTRACTION',
    provider:          'anthropic',
    model:             'claude-sonnet-4-6',
    max_tokens:        4096,
    temperature:       null,
    extended_thinking: false,
    thinking_budget:   null,
  },
  {
    task:              'PAYROLL_EXTRACTION',
    provider:          'anthropic',
    model:             'claude-haiku-4-5',
    max_tokens:        4096,
    temperature:       null,
    extended_thinking: false,
    thinking_budget:   null,
  },
  {
    task:              'NF_EXTRACTION',
    provider:          'anthropic',
    model:             'claude-haiku-4-5',
    max_tokens:        2048,
    temperature:       null,
    extended_thinking: false,
    thinking_budget:   null,
  },
  {
    task:              'RUBRIC_CLASSIFICATION',
    provider:          'anthropic',
    model:             'claude-haiku-4-5',
    max_tokens:        1024,
    temperature:       0.0,
    extended_thinking: false,
    thinking_budget:   null,
  },
  {
    task:              'TIMESHEET_CLASSIFICATION',
    provider:          'anthropic',
    model:             'claude-haiku-4-5',
    max_tokens:        1024,
    temperature:       0.0,
    extended_thinking: false,
    thinking_budget:   null,
  },
  {
    task:              'PROJECT_DESCRIPTION',
    provider:          'anthropic',
    model:             'claude-opus-4-6',
    max_tokens:        8000,
    temperature:       0.7,
    extended_thinking: true,
    thinking_budget:   4000,
  },
];

// ─── Prompts ───────────────────────────────────────────────────────────────

const prompts: Array<{ task: string; prompt_type: string; content: string; notes: string }> = [

  // FORMPD_EXTRACTION ────────────────────────────────────────────────────────
  {
    task: 'FORMPD_EXTRACTION', prompt_type: 'SYSTEM',
    notes: 'v1 — seed inicial',
    content: `Você é especialista em incentivos fiscais da Lei do Bem (Lei nº 11.196/2005) e nos formulários FORMP&D do MCTI.
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
}`,
  },
  {
    task: 'FORMPD_EXTRACTION', prompt_type: 'TASK_INSTRUCTION',
    notes: 'v1 — seed inicial',
    content: `Extraia todos os dados deste formulário FORMP&D e retorne no formato JSON especificado.`,
  },

  // PAYROLL_EXTRACTION ───────────────────────────────────────────────────────
  {
    task: 'PAYROLL_EXTRACTION', prompt_type: 'SYSTEM',
    notes: 'v1 — seed inicial',
    content: `Você é especialista em folha de pagamento e obrigações trabalhistas brasileiras.
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
}`,
  },
  {
    task: 'PAYROLL_EXTRACTION', prompt_type: 'TASK_INSTRUCTION',
    notes: 'v1 — seed inicial',
    content: 'Extraia todos os dados desta ficha de pagamento e retorne no formato JSON especificado.',
  },

  // NF_EXTRACTION ────────────────────────────────────────────────────────────
  {
    task: 'NF_EXTRACTION', prompt_type: 'SYSTEM',
    notes: 'v1 — seed inicial',
    content: `Você é especialista em classificação fiscal de bens do ativo imobilizado para fins de Lei do Bem.
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
}`,
  },
  {
    task: 'NF_EXTRACTION', prompt_type: 'TASK_INSTRUCTION',
    notes: 'v1 — seed inicial',
    content: 'Extraia os dados desta nota fiscal e classifique o bem adquirido. Retorne no formato JSON especificado.',
  },

  // RUBRIC_CLASSIFICATION ────────────────────────────────────────────────────
  {
    task: 'RUBRIC_CLASSIFICATION', prompt_type: 'SYSTEM',
    notes: 'v1 — seed inicial',
    content: `Você é especialista em legislação trabalhista e no programa Lei do Bem (Lei nº 11.196/2005, Decreto 5.798/2006).
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
}`,
  },
  {
    task: 'RUBRIC_CLASSIFICATION', prompt_type: 'TASK_INSTRUCTION',
    notes: 'v1 — seed inicial',
    content: 'Classifique esta rubrica de folha de pagamento quanto à elegibilidade para o programa Lei do Bem. Retorne no formato JSON especificado.',
  },

  // TIMESHEET_CLASSIFICATION ─────────────────────────────────────────────────
  {
    task: 'TIMESHEET_CLASSIFICATION', prompt_type: 'SYSTEM',
    notes: 'v1 — seed inicial',
    content: `Você é especialista em gestão de projetos PD&I e no programa Lei do Bem.
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
}`,
  },
  {
    task: 'TIMESHEET_CLASSIFICATION', prompt_type: 'TASK_INSTRUCTION',
    notes: 'v1 — seed inicial',
    content: 'Classifique esta atividade de timesheet quanto à elegibilidade para PD&I. Retorne no formato JSON especificado.',
  },

  // PROJECT_DESCRIPTION ──────────────────────────────────────────────────────
  {
    task: 'PROJECT_DESCRIPTION', prompt_type: 'SYSTEM',
    notes: 'v1 — seed inicial',
    content: `Você é especialista sênior em Lei do Bem (Lei nº 11.196/2005) e na elaboração de projetos PD&I para o FORMP&D do MCTI.
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
}`,
  },
  {
    task: 'PROJECT_DESCRIPTION', prompt_type: 'TASK_INSTRUCTION',
    notes: 'v1 — seed inicial',
    content: 'Elabore a descrição técnica deste projeto PD&I para o formulário FORMP&D. Retorne no formato JSON especificado.',
  },
];

// ─── Preços Anthropic (vigentes em Mar/2026, USD por 1M tokens) ───────────

const pricing = [
  { provider: 'anthropic', model: 'claude-opus-4-6',   input_cost_per_1m_tokens: 15.0,  output_cost_per_1m_tokens: 75.0,  notes: 'Preço vigente Mar/2026' },
  { provider: 'anthropic', model: 'claude-sonnet-4-6', input_cost_per_1m_tokens: 3.0,   output_cost_per_1m_tokens: 15.0,  notes: 'Preço vigente Mar/2026' },
  { provider: 'anthropic', model: 'claude-haiku-4-5',  input_cost_per_1m_tokens: 0.8,   output_cost_per_1m_tokens: 4.0,   notes: 'Preço vigente Mar/2026' },
];

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding módulo IA...\n');

  // Task configs (upsert por task)
  for (const cfg of taskConfigs) {
    await prisma.ia_task_configs.upsert({
      where:  { task: cfg.task },
      update: { ...cfg },
      create: { id: crypto.randomUUID(), ...cfg },
    });
    console.log(`  ✅ ia_task_configs: ${cfg.task} → ${cfg.model}`);
  }

  // Prompts v1 (apenas cria se não existir a versão 1)
  for (const p of prompts) {
    const exists = await prisma.ia_prompts.findFirst({
      where: { task: p.task, prompt_type: p.prompt_type, version: 1 },
    });
    if (!exists) {
      await prisma.ia_prompts.create({
        data: { id: crypto.randomUUID(), ...p, version: 1, is_active: true },
      });
      console.log(`  ✅ ia_prompts: ${p.task}/${p.prompt_type} v1`);
    } else {
      console.log(`  ⏭️  ia_prompts: ${p.task}/${p.prompt_type} v1 já existe`);
    }
  }

  // Pricing (upsert por provider+model+valid_from)
  for (const price of pricing) {
    const validFrom = new Date('2026-01-01');
    const existing = await prisma.ia_model_pricing.findFirst({
      where: { provider: price.provider, model: price.model, valid_from: validFrom },
    });
    if (!existing) {
      await prisma.ia_model_pricing.create({
        data: { id: crypto.randomUUID(), ...price, valid_from: validFrom },
      });
      console.log(`  ✅ ia_model_pricing: ${price.provider}/${price.model}`);
    } else {
      console.log(`  ⏭️  ia_model_pricing: ${price.provider}/${price.model} já existe`);
    }
  }

  console.log('\n✅ Seed IA concluído!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
