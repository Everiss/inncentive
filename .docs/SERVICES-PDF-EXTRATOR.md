# SERVICES-PDF-EXTRATOR — Estratégia de Evolução da API

Guia de documentação: [README_DOCS.md](./README_DOCS.md)
Última atualização: 2026-03-27
Versão: 1.0

---

## 1. Diagnóstico do estado atual

### 1.1 Parsers — problema de granularidade invertida

**ATUAL** (parsers com responsabilidade excessiva):

| Parser atual | Problema |
|---|---|
| `project_parser` | "dono" de title + category + description + methodology + TRL + keywords + ... |
| `hr_parser` | todos os projetos, todas as versões, em um único loop |
| `expenses_parser` | só processa v3; v1/v2 retornam `[]` — perda total |

**Consequência**: erro em uma seção → perda total; versão não mapeada → silêncio total.

### 1.2 Schema — fat table sem auditoria

`formpd_projects` tem 56 colunas `MEDIUMTEXT` soltas, sem:

- rastreamento de qual versão do formulário gerou o dado
- confiança por campo
- campos faltantes detectados no AB2024 (`trl_justification`, `gross_revenue`, escalas MRL/STRL, `disclosure_authorized`)

---

## 2. Mapeamento completo de campos por versão

Baseado nos 8 PDFs analisados (AB2017 → AB2024).

### 2.1 Seção Empresa / Recibo

| Campo | v1 (2017–18) | v2_early (2019–21) | v2_late (2022) | v3_early (2023) | v3_late (2024+) |
|---|---|---|---|---|---|
| `cnpj` | `1.1.3. CNPJ\n[value]` | header `CNPJ: xx.xx/xx-xx` | idem | `DADOS DA EMPRESA\nCNPJ:\n[raw14]` | idem |
| `legal_name` | `1.1.1. RAZÃO SOCIAL:\n[val]` | `Razão Social:\n[val]` header | idem | `DADOS DA EMPRESA\nRAZÃO SOCIAL:\n[val]` | idem |
| `fiscal_year` | `Ano Base: YYYY` header | idem | idem | `ANO BASE YYYY` recibo | idem |
| `sender_name` | ✗ | `Nome: [val]` (inline) | idem | `NOME:\n[val]` (próx. linha) | idem |
| `sender_cpf` | ✗ | `CPF: xxx.xxx.xxx-xx` | idem | `CPF:\n[raw11]` | idem |
| `expedition_at` | ✗ | `Expedição: DD/MM/AAAA - HH:MM:SS` | idem | `EXPEDIÇÃO:\nDD/MM/AAAA HH:MM:SS` | idem |
| `authenticity_code` | ✗ | `[25 dígitos]` | idem | `[UUID alfanum-com-dashes]` | idem |
| `company_type` | `1.1.4. TIPO → (O) Privado` | `1.1.1. Tipo de Organismo\n[val]` | idem | `TIPO DE ORGANISMO:\n[val]` | `QUAL É O TIPO DE EMPRESA?\n[val]` |
| `capital_origin` | `2.1.1. ORIGEM → (O) NACIONAL` | `2.1.1. Origem\n[val]` | idem | `ORIGEM DO CAPITAL:\n[val]` | `QUAL É A ORIGEM...?\n[val]` |
| `group_relationship` | `2.1.2. → (O) CONTROLADORA` | `2.1.2. Relação\n[val]` | idem | `QUAL A SUA RELAÇÃO...\n[val]` | idem |
| `net_revenue` | `2.1.3. [value sem R$]` | `2.1.3. R$ [value]` | idem | `QUAL O VALOR DA RECEITA LÍQUIDA...\nR$ [val]` | idem |
| `gross_revenue` | ✗ | ✗ | ✗ | ✗ | `QUAL É O VALOR DA RECEITA OPERACIONAL BRUTA...\nR$ [val]` |
| `employee_count` | `2.1.6. [value]` | `2.1.4. [value]` | idem | `O NÚMERO TOTAL DE FUNCIONÁRIOS...\n[val]` | `QUAL É O TOTAL DE FUNCIONÁRIOS...\n[val]` |
| `fiscal_loss` | `(O) Não / ( ) Sim` radio | Não/Sim texto | idem | Sim/Não texto | idem |
| `irpj_apuration` | `(O) Lucro real anual` radio | texto | idem | texto | idem |
| `fiscal_loss_justification` | `2.1.5.3.` | `2.2.2.` | idem | `SE FOR USUFRUIR...:\n[val]` | idem |
| `disclosure_authorized` | ✗ | ✗ | ✗ | `A EMPRESA AUTORIZA...\nSim/Não` | idem |
| `rnd_org_structure` | ✗ | ✗ | ✗ | ✗ | `ESTRUTURA ORGANIZACIONAL DE P&D:\n[val]` |

### 2.2 Seção Projeto

| Campo | v1 | v2_early | v2_late | v3_early | v3_late (2024) |
|---|---|---|---|---|---|
| `title` | `3.1.1. [Item N] Nome da atividade de PD&I` | `3.1.1. Nome (sem [Item])` | `3.1.1. [Item N] Nome` | `ITEM/NOME DA ATIVIDADE DE PD&I:` | `ITEM/TÍTULO DO PROJETO DE PD&I:` |
| `category` | `3.1.2. PB, PA ou DE` | `3.1.3. PB, PA ou DE` | idem | `PB, PA OU DE: PA – Pesquisa Aplicada` | `CATEGORIA PREDOMINANTE NO PROJETO...:` |
| `nature` | `3.1.3. Natureza` radio | `3.1.7. Natureza` texto | idem | `NATUREZA:` | idem |
| `description` | `3.1.X. Descrição` | `3.1.2. Descrição` | idem | `DESCRIÇÃO DO PROJETO` | `DESCRIÇÃO DO PROJETO:` |
| `tech_area` | ✗ | `3.1.4–3.1.5. Área` | idem | `ÁREA DO PROJETO:` | `ÁREA (PREDOMINANTE...):` |
| `knowledge_area` | ✗ | `3.1.4.1. Especificar` | idem | `ESPECIFICAR ÁREA DE CONHECIMENTO...:` | idem |
| `keywords` | ✗ | `3.1.6. Palavras-Chave` | idem | `PALAVRAS-CHAVE:` | idem |
| `innovative_element` | `3.1.3. Destaque o elemento` | `3.1.8. Destaque o elemento` | idem | `DESTAQUE O ELEMENTO TECNOLOGICAMENTE NOVO...` | idem |
| `innovative_challenge` | ✗ | `3.1.X. Qual a barreira` | idem | `QUAL A BARREIRA OU DESAFIO TECNOLÓGICO...?` | idem |
| `methodology` | ✗ | `3.1.X. Metodologia` | idem | `QUAL A METODOLOGIA/MÉTODOS UTILIZADOS?` | idem |
| `is_continuous` | `3.1.X. contínua` radio | `3.1.X. contínua` texto | idem | `A ATIVIDADE É CONTÍNUA (CICLO DE VIDA MAIOR...)?` | idem |
| `additional_info` | ✗ | `3.1.X. Informações complementares` | idem | `INFORMAÇÕES COMPLEMENTARES...` | idem |
| `economic_result` | ✗ | `3.1.15.1. Resultado Econômico` | idem | `RESULTADO ECONÔMICO` | idem |
| `innovation_result` | ✗ | `3.1.15.2. Resultado de Inovação` | idem | `RESULTADO DE INOVAÇÃO` | idem |
| `trl_initial` / `trl_final` | ✗ | pode existir | idem | `INICIAL: TRL N / FINAL: TRL N` | `INICIAL: TRL N / MRL N / STRL N` |
| `trl_justification` | ✗ | ✗ | ✗ | ✗ | `JUSTIFIQUE O(S) NÍVEL(IS) DE MATURIDADE...` |
| `sdg_codes` | ✗ | ✗ | ✗ | `OBJETIVOS DE DESENVOLVIMENTO SUSTENTÁVEL` | idem |
| `public_policy` | ✗ | ✗ | ✗ | `POLÍTICAS PÚBLICAS NACIONAIS` | idem |
| `aligns_public_policy` | ✗ | ✗ | ✗ | yes/no após label | idem |

### 2.3 Seção Dispêndios por Projeto

| Campo | v1 (numbered) | v2_early | v2_late | v3 (table) |
|---|---|---|---|---|
| HR header | `3.1.X.X.X. [Item N] RECURSOS HUMANOS` | `3.1.X.X.X. [Item N] RELAÇÃO DE RECURSOS HUMANOS` | idem | dentro do bloco, sem numeração |
| `hr.cpf` | `CPF [value]` | idem | idem | coluna tabela |
| `hr.name` | `Nome [value]` | idem | idem | coluna tabela |
| `hr.qualification` | `Titulação [value]` | idem | idem | `TITULAÇÃO` |
| `hr.role` | ✗ (pré-2019) | `Função [value]` | idem | `FUNÇÃO` |
| `hr.annual_hours` | `Total Horas (Anual) [value]` | idem | idem | `TOTAL HORAS (ANUAL)` |
| `hr.dedication` | `Dedicação Exclusiva/Parcial` | idem | idem | `DEDICAÇÃO` |
| `hr.annual_amount` | `Valor (R$) R$ [value]` | idem | idem | `VALOR R$` |
| `hr.activity_desc` | ✗ | ✗ | ✗ | `DESCREVA AS ATIVIDADES REALIZADAS...` |
| Expense header | `3.1.X.X.X. [Item N] SERVIÇO DE APOIO PF/PJ, MATERIAL DE CONSUMO, TIB E VIAGENS` | idem | idem | linhas de `ITENS DE DISPÊNDIO` |
| `exp.supplier_cnpj` | `CNPJ [value]` | idem | idem | ✗ |
| `exp.supplier_name` | `Nome [value]` | idem | idem | ✗ |
| `exp.amount` | `Valor Total (R$) R$ [value]` | idem | idem | valor na linha |
| `exp.description` | `Caracterizar o Serviço Realizado [value]` | idem | idem | category label |
| `exp.status` | `Situação Terminado/Em execução` | idem | idem | ✗ |
| Equipment header | `3.1.X.X.X. EQUIPAMENTOS NACIONAIS/IMPORTADOS` | idem | idem | linha em `ITENS DE DISPÊNDIO` |
| Financing | ✗ | ✗ | ✗ | `RECURSOS PRÓPRIOS %: [val] / FINANCIAMENTOS %: [val]` |

---

## 3. Arquitetura de parsers granulares

### 3.1 Estrutura de pastas proposta

```
parsers/
  common/
    base.py              # FieldResult(value, raw, confidence, source, version)
    noise_filter.py      # Rodapés: "Gerado em", "Página N/M", "Código de autenticidade"
    section_slicer.py    # Encontra fronteiras de seções por versão

  version_detector.py   # 6 profiles: v1_2017, v1_2018, v2_early, v2_late, v3_early, v3_late

  receipt/
    receipt_inline_parser.py    # v2: "Nome: [val]" na mesma linha
    receipt_multiline_parser.py # v3: "NOME:\n[val]" em linhas separadas

  company/
    cnpj_anchored_parser.py     # busca "CNPJ:\n[val]" com contexto de seção
    legal_name_parser.py        # "RAZÃO SOCIAL" → fallback chain
    company_registry_parser.py  # bloco "DADOS PESSOA JURIDICA"

  identification/
    ident_radio_parser.py    # v1: "(O) opção" radio buttons
    ident_numbered_parser.py # v2: "2.1.X. label\nvalor"
    ident_flat_parser.py     # v3: "LABEL:\nvalor" e "LABEL?\nvalor"

  projects/
    block_finder.py          # v1/v2: "3.1.1. [Item N]" | v3: "PROGRAMA/ATIVIDADES - N"
    summary_table_parser.py  # v3: tabela-resumo (Item|Nome|Palavras|Valor)
    metadata_parser.py       # title, category, nature, dates, is_continuous (versionado)
    narrative_parser.py      # innovative_element, challenge, methodology, additional_info
    result_parser.py         # economic_result, innovation_result (objective + obtained)
    trl_parser.py            # TRL/MRL/STRL initial/final + justification
    sdg_parser.py            # ODS codes + justification
    policy_parser.py         # políticas públicas + referência
    keywords_parser.py       # split ";" ou "," → keywords_1..5

  dispendios/
    hr_numbered_v1_parser.py    # header "RECURSOS HUMANOS" sem "RELAÇÃO DE"
    hr_numbered_v2_parser.py    # header "RELAÇÃO DE RECURSOS HUMANOS ENVOLVIDOS"
    hr_table_v3_parser.py       # tabela inline no bloco PROGRAMA/ATIVIDADES
    hr_activity_v3_parser.py    # "DESCREVA AS ATIVIDADES REALIZADAS..."

    expenses_numbered_v1_parser.py  # "3.1.X.X.X. SERVIÇO/MATERIAL" com Item/Situação/CNPJ/Valor
    expenses_numbered_v2_parser.py  # idem v1 + "Caracterizar o Serviço" + mais sub-categorias
    expenses_table_v3_parser.py     # "ITENS DE DISPÊNDIO" tabela com hierarquia
    expenses_hierarchy_resolver.py  # separa pai/filho sem depender de indentação

    equipment_numbered_parser.py    # "EQUIPAMENTOS NACIONAIS/IMPORTADOS" numbered
    equipment_table_v3_parser.py    # equipamentos dentro do bloco v3

    partners_parser.py   # EMPRESA COOPERADORA, UNIVERSIDADE, INVENTOR
    patents_parser.py    # BENS INTANGÍVEIS, PATENTES

  fiscal/
    fiscal_summary_parser.py    # INCENTIVOS FISCAIS: dedução IRPJ/CSLL
    financing_parser.py         # FONTES: recursos próprios % + financiamentos %

  representatives/
    representatives_parser.py   # REPRESENTANTE CORPORATIVO + RESPONSÁVEL PREENCHIMENTO
```

### 3.2 Contrato comum — `FieldResult`

Cada parser retorna instâncias de `FieldResult`:

```python
@dataclass
class FieldResult:
    value: Any
    raw: str             # trecho exato do PDF
    confidence: float    # 0.0–1.0: 1.0=regex exata, 0.7=fuzzy, 0.4=fallback
    source: Literal["PATTERN_EXACT", "PATTERN_FUZZY", "FALLBACK", "NOT_FOUND"]
    version: str         # perfil de versão usado
```

### 3.3 Resolver de hierarquia de despesas sem indentação

Substitui `_keep_leaf_spends()` — PyMuPDF normaliza espaços, tornando `_indent_level()` ineficaz. Usar heurística semântica:

1. Linha com valor > 0 E linha **anterior** é categoria-pai conhecida (ex: `"SERVIÇOS DE TERCEIROS"`) → descartar o pai
2. Comparar valor da linha com **soma das linhas seguintes** do mesmo bloco → se igual, é pai agregador
3. Usar lista de **categorias pai conhecidas** como gatilho de pruning (sem depender de indent)

---

## 4. Schema — avaliação e proposta

### 4.1 Problemas críticos no schema atual

**`formpd_project_human_resources` — inversão anual/mensal:**
O schema tem `monthly_hours` e `monthly_gross`, mas todos os formulários MCTI reportam **totais anuais**. Há mismatch direto entre parser e banco.

**`formpd_project_expenses.expense_category` — enum insuficiente:**
- Enum atual: `SERVICO_APOIO_PF`, `SERVICO_APOIO_PJ`, `MATERIAL_CONSUMO`, `TIB`, `DESPESA_OPERACIONAL`
- V1/V2 tem: `SERVIÇO DE APOIO TÉCNICO + TIB + VIAGENS PF/PJ`, `MICRO EMPRESA`, `EPP`, `INVENTOR INDEPENDENTE`, `UNIVERSIDADE`, `INSTITUIÇÃO DE PESQUISA` — categorias não mapeáveis sem perda de informação.

**`formpd_projects` — campos ausentes para AB2024+:**
- `trl_justification` (texto)
- `mrl_initial`, `mrl_final`, `strl_initial`, `strl_final` (escalas adicionais v3)
- `nature` (Produto/Processo/Serviço — obrigatório MCTI em todos os anos)
- `financing_own_pct`, `financing_external_pct` (fontes de financiamento v3)

**`formpd_forms` — campos ausentes para AB2024+:**
- `form_version` (qual versão do formulário foi a fonte)
- `gross_revenue` (novo em AB2024)
- `disclosure_authorized` (novo em v3)
- `rnd_org_structure` (estrutura organizacional P&D, v3+)

**`formpd_projects` — sem rastreamento de fonte/confiança:**
Todos os 56 campos chegam sem nenhuma indicação de: foi extraído deterministicamente? com que confiança? de que trecho do PDF?

### 4.2 Migrations propostas

```sql
-- Campos faltantes em formpd_projects
ALTER TABLE formpd_projects
  ADD COLUMN trl_justification      MEDIUMTEXT    NULL AFTER trl_final,
  ADD COLUMN mrl_initial            INT           NULL,
  ADD COLUMN mrl_final              INT           NULL,
  ADD COLUMN strl_initial           INT           NULL,
  ADD COLUMN strl_final             INT           NULL,
  ADD COLUMN nature                 VARCHAR(30)   NULL,  -- PRODUTO/PROCESSO/SERVICO
  ADD COLUMN financing_own_pct      DECIMAL(5,2)  NULL,
  ADD COLUMN financing_external_pct DECIMAL(5,2)  NULL,
  ADD COLUMN form_version           VARCHAR(20)   NULL;  -- v1_2017, v2_late, v3_early...

-- Campos faltantes em formpd_forms
ALTER TABLE formpd_forms
  ADD COLUMN form_version           VARCHAR(20)   NULL,
  ADD COLUMN gross_revenue          DECIMAL(18,2) NULL,
  ADD COLUMN disclosure_authorized  BOOLEAN       NULL,
  ADD COLUMN rnd_org_structure      TEXT          NULL,
  ADD COLUMN irpj_apuration_type    VARCHAR(50)   NULL;

-- Corrigir inversão anual/mensal em formpd_project_human_resources
ALTER TABLE formpd_project_human_resources
  CHANGE monthly_hours    annual_hours        DECIMAL(8,2)  NULL,
  CHANGE monthly_gross    annual_gross        DECIMAL(18,2) NULL,
  ADD COLUMN annual_amount       DECIMAL(18,2) NULL,  -- valor total anual
  ADD COLUMN dedication_type     VARCHAR(20)   NULL,  -- EXCLUSIVA / PARCIAL
  ADD COLUMN activity_description TEXT         NULL;  -- v3: "descreva as atividades"

-- Campos faltantes em formpd_project_expenses
ALTER TABLE formpd_project_expenses
  ADD COLUMN supplier_cnpj_raw   VARCHAR(20)  NULL,
  ADD COLUMN service_description TEXT         NULL,  -- v2: "Caracterizar o Serviço Realizado"
  ADD COLUMN service_status      VARCHAR(20)  NULL,  -- TERMINADO / EM_EXECUCAO
  ADD COLUMN partner_type        VARCHAR(50)  NULL;  -- MICRO_EMPRESA / EPP / INVENTOR / ICT
```

### 4.3 Nova tabela: `formpd_field_extractions`

Auditoria de extração campo a campo:

```sql
CREATE TABLE formpd_field_extractions (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id   INT             NULL,       -- NULL = campos de formpd_forms
  form_id      INT             NOT NULL,
  field_path   VARCHAR(128)    NOT NULL,   -- ex: "projects[1].hr[0].cpf"
  value_json   JSON            NULL,
  raw_text     TEXT            NULL,       -- trecho exato do PDF que gerou o valor
  confidence   DECIMAL(3,2)   NOT NULL DEFAULT 0.00,
  source       ENUM('DETERMINISTIC','AI','MANUAL') NOT NULL DEFAULT 'DETERMINISTIC',
  form_version VARCHAR(20)    NULL,
  extracted_at DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_field_extraction (form_id, project_id, field_path, source),
  INDEX idx_form_id (form_id),
  INDEX idx_project_id (project_id),
  INDEX idx_confidence (confidence)
) ENGINE=InnoDB;
```

### 4.4 Nova tabela: `formpd_extraction_scores`

Score de acurácia por formulário e projeto:

```sql
CREATE TABLE formpd_extraction_scores (
  id                     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  form_id                INT           NOT NULL,
  project_id             INT           NULL,       -- NULL = score do form inteiro
  form_version           VARCHAR(20)   NOT NULL,

  -- Completude de campos obrigatórios Lei do Bem
  mandatory_total        INT           NOT NULL DEFAULT 0,
  mandatory_found        INT           NOT NULL DEFAULT 0,
  completeness_pct       DECIMAL(5,2)  NOT NULL DEFAULT 0.00,

  -- Cobertura financeira
  hr_records             INT           NOT NULL DEFAULT 0,
  expenses_records       INT           NOT NULL DEFAULT 0,
  equipment_records      INT           NOT NULL DEFAULT 0,
  declared_total         DECIMAL(18,2) NULL,       -- da tabela-resumo v3
  extracted_total        DECIMAL(18,2) NULL,       -- soma do que foi extraído
  financial_coverage_pct DECIMAL(5,2)  NULL,

  -- Confiança média dos campos
  avg_confidence         DECIMAL(3,2)  NOT NULL DEFAULT 0.00,
  high_conf_fields       INT           NOT NULL DEFAULT 0,
  low_conf_fields        INT           NOT NULL DEFAULT 0,

  -- Cross-validation flags
  cnpj_valid             BOOLEAN       NULL,
  fiscal_year_valid      BOOLEAN       NULL,
  hr_sum_matches         BOOLEAN       NULL,       -- sum(hr.annual_amount) ≈ total_rh
  expenses_sum_matches   BOOLEAN       NULL,
  project_count_matches  BOOLEAN       NULL,       -- tabela-resumo vs projetos extraídos

  -- Score final 0–100
  overall_score          DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  needs_ai               BOOLEAN       NOT NULL DEFAULT FALSE,
  ai_priority_fields     JSON          NULL,       -- campos críticos para IA completar

  scored_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scorer_version         VARCHAR(20)   NOT NULL DEFAULT 'v1',
  PRIMARY KEY (id),
  UNIQUE KEY uq_score (form_id, project_id, scorer_version),
  INDEX idx_form (form_id),
  INDEX idx_score (overall_score),
  INDEX idx_needs_ai (needs_ai)
) ENGINE=InnoDB;
```

---

## 5. Engine de scoring — fórmula e critérios

### 5.1 Campos obrigatórios Lei do Bem por versão

```python
MANDATORY_BY_VERSION = {
    "v1_2017":  ["cnpj", "fiscal_year", "projects.title", "projects.category"],
    "v1_2018":  ["cnpj", "fiscal_year", "projects.title", "projects.category",
                 "projects.innovative_element"],
    "v2_early": ["cnpj", "fiscal_year", "submission_receipt.*",
                 "projects.title", "projects.category", "projects.innovative_element",
                 "projects.hr"],
    "v2_late":  ["cnpj", "fiscal_year", "submission_receipt.*",
                 "projects.title", "projects.category", "projects.hr",
                 "projects.expenses", "projects.economic_result"],
    "v3_early": ["cnpj", "fiscal_year", "submission_receipt.*",
                 "projects.title", "projects.category", "projects.methodology",
                 "projects.trl_initial", "projects.hr"],
    "v3_late":  ["cnpj", "fiscal_year", "submission_receipt.*",
                 "projects.title", "projects.category", "projects.methodology",
                 "projects.trl_initial", "projects.trl_justification", "projects.hr"],
}
```

### 5.2 Regras de cross-validation

| Código | Regra |
|---|---|
| CV-01 | CNPJ checksum válido (algoritmo LMU) |
| CV-02 | `fiscal_year` entre 2005 e 2030 |
| CV-03 | `sum(hr.annual_amount) ≈ project.total_rh_amount` (tolerância 5%) |
| CV-04 | `sum(expenses.amount + equipment.amount) ≈ total_expense_amount` |
| CV-05 | `project_count_summary_table == len(projects)` (v3 only) |
| CV-06 | `total_summary_table == sum(project_values)` (v3 only) |
| CV-07 | `authenticity_code` formato válido (25 dígitos v2 / UUID-like v3) |
| CV-08 | `hr_count > 0` se `total_rh > 0` |
| CV-09 | `category` in `[PB, PA, DE, INOVACAO_TECNOLOGICA]` |

### 5.3 Fórmula de score

```python
def score(completeness: float, confidence: float, cross_validation: float) -> float:
    """
    Retorna score 0.0–1.0 (multiplicar por 100 para percentual).
    - completeness:     % campos obrigatórios encontrados
    - confidence:       média de confiança dos campos extraídos
    - cross_validation: % regras CV aprovadas
    """
    return (
        0.40 * completeness
      + 0.30 * confidence
      + 0.30 * cross_validation
    )

# Limiares para acionamento de IA
# score >= 0.85 → HIGH   — não precisa de IA
# score  0.60–0.85 → MEDIUM — IA para campos específicos (ai_priority_fields)
# score < 0.60  → LOW   — IA full reextraction recomendada
```

---

## 6. Roadmap de implementação

### Sprint 1 — Corrigir perdas críticas ✅ CONCLUÍDO

| # | Arquivo | Problema corrigido |
|---|---|---|
| 1 ✅ | `hr_parser.py` — `_V1_SECTION_RE` + `_parse_numbered_hr()` | RECURSOS HUMANOS sem "RELAÇÃO DE" (v1 completamente ausente) |
| 2 ✅ | `hr_parser.py` — `_parse_hr_v3_table()` | Tabela inline dentro do bloco PROGRAMA/ATIVIDADES (v3 ausente) |
| 3 ✅ | `expenses_parser.py` — `_parse_expenses_numbered()` | Despesas v1 — retornavam `[]` |
| 4 ✅ | `expenses_parser.py` — dispatch `family` v2 | Despesas v2 — retornavam `[]` |
| 5 ✅ | `receipt_parser.py` — `_scan_label()` + `_extract_recibo_block_v2()` | Campos multiline v3 e bloco v2 ausente |
| 6 ✅ | `expenses_parser.py` — `_is_aggregator()` semântico | Hierarquia por soma/prefixo, sem depender de indentação |

**Notas de implementação:**
- Todos os 3 parsers agora aceitam `family` como parâmetro e fazem dispatch
- `extraction_service.py` atualizado para passar `family=_family` a `parse_hr()` e `parse_expenses()`
- Expenses v1/v2 enriquecidas: `supplier_cnpj_raw`, `supplier_name`, `service_status` passados no payload

### Sprint 2 — Aumentar cobertura de campos ✅ CONCLUÍDO

| # | Arquivo | O que adiciona |
|---|---|---|
| 7 ✅ | `projects_parser.py` — `_new_project()` + `_parse_modern_v3()` | `nature`, `trl_justification`, `mrl_*`, `strl_*`, `financing_own_pct`, `financing_external_pct`, `economic_result_objective`, `innovation_result_objective` |
| 8 ✅ | `projects_parser.py` — fix `knowledge_area` vs `specific_area` | `knowledge_area` = área geral; `specific_area` = sub-área especificada |
| 9 ✅ | `projects_parser.py` — `_parse_legacy_v1_v2()` | Campos adicionais v1/v2: `nature`, `innovative_element`, `methodology`, `economic_result`, `keywords` |
| 10 ✅ | Migration SQL | `formpd_projects`, `formpd_forms`, `formpd_project_human_resources`, `formpd_project_expenses` |

### Sprint 3 — Scoring e auditoria ✅ CONCLUÍDO

| # | Entregável | Descrição |
|---|---|---|
| 11 ✅ | `version_detector.py` | 6 profiles granulares; `profile` (granular) + `family` (compat) no retorno |
| 12 ✅ | `summary_table_parser.py` | Tabela-resumo v3: `project_count`, `declared_total`, `rows[]` para CV-05/06 |
| 13 ✅ | `scorer.py` | Engine completo: `compute_score()` → `overall_score`, `score_band`, 9 regras CV, `ai_priority_fields` |
| 14 ✅ | `extraction_service.py` | Score integrado ao payload; `meta.quality_policy.score`; `parser_version` bumped para v2 |
| 15 ✅ | Migration `20260327_formpd_sprint3_scoring` | `formpd_field_extractions` + `formpd_extraction_scores` com FK cascade |

**Notas de implementação:**
- `version_detector` retorna `profile` (6 valores) + `family` (3 valores retrocompatível) — parsers existentes usam `family` sem mudança
- `scorer.py` usa pesos 0.40/0.30/0.30 (completude/confiança/CV) conforme especificação
- `summary_table` adicionado em `form_data` e passado ao scorer para CV-05/CV-06
- Thresholds: ≥0.85 → HIGH, 0.60–0.84 → MEDIUM, <0.60 → LOW

### Sprint 4 — Qualidade e observabilidade ✅ CONCLUÍDO

| # | Entregável | Descrição |
|---|---|---|
| 15 ✅ | UI revisão | `ScorePanel` em `TabForms.tsx`: gauge HIGH/MEDIUM/LOW + barra completude/confiança/CV + campos ausentes + falhas CV collapsível |
| 16 ✅ | Testes de fixture | 69 testes unitários cobrindo version_detector, receipt_parser, hr_parser, summary_table_parser e scorer |
| 17 ✅ | Alerta automático | `score_band === 'LOW'` → `enqueueAi()` automático em `imports.service.ts` após `persistFormBatch` |

**Item 15 — implementado em** `frontend/src/components/TabForms.tsx`:
- `ExtractionScore` interface com todos os campos do scorer
- `ScorePanel` component: `score_pct` + `score_band` badge (HIGH=verde, MEDIUM=âmbar, LOW=vermelho), mini-barras horizontais para completude/confiança/cross_validation, tags de `ai_priority_fields`, seção colapsável de CV failures
- Score extraído de `parsed.meta.quality_policy.score` no `openReview`
- Fallback para banner antigo de "IA recomendada" quando score não está disponível
