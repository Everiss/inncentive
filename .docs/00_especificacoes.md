Aqui está a conversão completa do seu documento HTML para um formato Markdown (MD) estruturado. Este formato é ideal para alimentar agentes de IA (como os agentes de desenvolvimento Antigravity do Google), pois organiza hierarquicamente o fluxo de dados, as tabelas envolvidas, as dependências e as regras de negócio de cada etapa.

***

# Documentação de Arquitetura e Fluxo do Sistema: Inncentive
**Contexto para Agentes de Desenvolvimento:** Este documento descreve o fluxo de dados e regras de negócio do "Inncentive", um sistema SaaS Multi-tenant para Gestão de Incentivos Fiscais focado na Lei do Bem (Lei nº 11.196/2005) e integrações acessórias (FORMP&D, SPED ECD/ECF, DIRBI). 

O sistema é dividido em 8 módulos (M0–M7). O M0 é um **gateway de entrada de dados via IA** que alimenta os demais módulos. Os M1-M7 formam o fluxo oficial de apuração fiscal. Cada etapa especifica tabelas do banco de dados (schema), dependências de execução e regras detalhadas para a modelagem da aplicação.

---

## 🤖 M0: Gateway de Importação via IA (PDF Externo)
**Objetivo:** Ingerir documentos externos (PDFs de FORMP&D histórico, folhas, NFs) via IA (Claude/Anthropic) com revisão humana obrigatória antes da promoção.

> **ATENÇÃO PARA AGENTES:** Este módulo é um canal de ENTRADA de dados para onboarding e histórico. Ele **NÃO substitui** o fluxo canônico dos módulos M3/M4. Dados deste modulo sempre passam por Staging com aprovação humana antes de alimentar tabelas finais.

### 0.1 Upload de PDF e Extração via IA
* **Tipo:** Importação Assíncrona com revisão humana
* **Descrição:** Usuário envia um PDF (FORMP&D histórico, folha, NF). O sistema armazena o arquivo localmente em `upload/[CNPJ]/[ANO_BASE]/[TIPO]/`, enfileira no Valkey (BullMQ) e o Worker extrai o JSON estruturado via API Anthropic Claude.
* **Tabelas Envolvidas:** `import_batches` (`entity_type = 'FORMPD_AI_EXTRACTION'`), `import_items` (campo `record_data` armazena o JSON como Staging)
* **Dependências:** Empresa cadastrada (M1), `ANTHROPIC_API_KEY` configurada
* **Regras de Negócio:**
    * **Rota Backend:** `POST /imports/upload-formpd-ai` com `multipart/form-data` contendo `file`, `companyId`, `cnpj`, `anoBase`.
    * **Armazenamento Local:** Caminho: `upload/{cnpj_sem_formatacao}/{ano_base}/FORM/{timestamp}-{filename}.pdf`.
    * **Fila:** `formpd-extraction` no Valkey. Concorrência controlada, máx. 3 tentativas com backoff de 5s.
    * **Staging:** O JSON retornado pelo Claude é salvo em `import_items.record_data` com `status = 'PENDING'`.
    * **Revisão obrigatória:** Nenhum dado de `import_items` pode ser promovido sem ação explícita do usuário (`status = PENDING → APPROVED`).
    * **Casos de uso permitidos:**
        * ✅ Onboarding de clientes com FORMP&D de anos anteriores (histórico)
        * ✅ Importação de folha de pagamento em PDF sem layout estruturado
        * ✅ Importação de NFs e contratos em formato não-estruturado
        * ❌ **Proibido:** Usar PDF externo como substituto do fluxo M3→M4→M6 para o exercício fiscal corrente
    * **Promoção:** O endpoint `POST /formpd/promote-from-import/{batchId}` quebra o JSON em registros nas tabelas canônicas (`formpd_forms`, `rdi_projects`, etc.) em uma única transação SQL.
    * **UI:** Tab dedicada "Import. IA" em cada empresa — fluxo completo em 4 telas: Dashboard → Upload → Processando → Revisão/Aprovação.

---

## 📦 M1: Cadastro e configuração de empresa
**Objetivo:** Dados cadastrais, regime tributário, acesso de usuários e configurações anuais.

### 1.1 Cadastro da empresa
* **Tipo:** Importação
* **Descrição:** CNPJ, razão social, porte, natureza jurídica, regime tributário (Lucro Real obrigatório), situação Receita Federal.
* **Tabelas Envolvidas:** `companies`, `tax_regregimes`, `addresses`, `company_cnaes`
* **Dependências:** (Nenhuma)
* **Regras de Negócio:**
    * **Fonte:** Receita Federal API / importação manual.
    * **Obrigatoriedade:** CNPJ + regime tributário devem ser preenchidos antes de qualquer outro módulo.
    * **Validação:** Deve ser Lucro Real para elegibilidade Lei do Bem.
    * **Próximo:** Configurar acesso de usuários e consultores.

### 1.2 Controle de acesso multi-empresa
* **Tipo:** Configuração
* **Descrição:** Vincula usuários (consultores ou clientes) à empresa com papel controlado: Owner, Consultant, Analyst, Viewer. Um consultor pode acessar N empresas.
* **Tabelas Envolvidas:** `user_company_access`, `users`, `contacts`
* **Dependências:** Empresa cadastrada
* **Regras de Negócio:**
    * **Papéis:** Owner, Consultant, Analyst, Viewer.
    * **Multi-tenant:** 1 consultor → N empresas.
    * **Auditoria:** Todas as ações rastreadas por `user_id`.

### 1.3 Configurações anuais do exercício
* **Tipo:** Configuração
* **Descrição:** Alíquotas patronais vigentes, taxas de depreciação, critérios de rateio overhead, base de rateio m². Versionado por exercício.
* **Tabelas Envolvidas:** `rdi_overhead_rates`, `company_fiscal_year_config`
* **Dependências:** Empresa cadastrada
* **Regras de Negócio:**
    * **Periodicidade:** 1 configuração por exercício fiscal.
    * **Rateio:** Base justificável (m², horas, headcount, medição direta).
    * **Vigência:** `valid_from` / `valid_until` para versionamento.
    * **Impacto:** Alimenta todos os cálculos de dispêndio do ano.

### 1.4 Catálogo de rubricas da folha
* **Tipo:** Importação/Configuração
* **Descrição:** Define as rubricas do sistema de RH da empresa com elegibilidade Lei do Bem. Pode ser importado ou configurado via IA com confirmação humana.
* **Tabelas Envolvidas:** `payroll_rubric_catalog`, `payroll_rubric_maps`
* **Dependências:** Empresa cadastrada
* **Regras de Negócio:**
    * **Elegibilidade:** 1 = elegível, 0 = inelegível, NULL = avaliar caso a caso.
    * **Mapeamento:** Código RH da empresa → rubrica interna normalizada.
    * **IA:** Sugestão automática; flag `confirmed_by_human` obrigatório.
    * **Versionamento:** `valid_from` protege histórico de importações passadas.

---

## 👥 M2: Entidades (Colaboradores e projetos PD&I)
**Objetivo:** Importação de pessoas e projetos com rastreabilidade desde o cadastro.

### 2.1 Importar colaboradores CLT
* **Tipo:** Importação
* **Descrição:** Importação em batch ou manual. Employment type, titulação acadêmica e flag de pesquisador são obrigatórios para declaração no FORMP&D.
* **Tabelas Envolvidas:** `collaborators`, `contacts`, `contact_companies`
* **Dependências:** Empresa cadastrada, Acesso configurado
* **Regras de Negócio:**
    * **Campos FORMP&D:** `employment_type`, `academic_degree`, `is_researcher`.
    * **Vínculo:** Colaborador pode existir sem ser usuário do sistema.
    * **Deduplicação:** CPF como chave primária de identificação.
    * **Engine BD:** Migrar colaboradores para InnoDB (FK real obrigatória).

### 2.2 Cadastrar projetos PD&I
* **Tipo:** Manual/Importação
* **Descrição:** Projetos internos sem vínculo com ano-base. Plurianuais por design. A categoria define a alíquota de exclusão: Básica 80%, Aplicada 70%, Experimental 60%.
* **Tabelas Envolvidas:** `rdi_projects`
* **Dependências:** Empresa cadastrada
* **Regras de Negócio:**
    * **Sem base_year:** Projeto vive no tempo (corte anual feito via snapshot).
    * **Categoria:** Determina alíquota de exclusão adicional no LALUR.
    * **Obrigatório:** Objetivo tecnológico para narrativa FORMP&D.
    * **Plurianual:** `is_continuous` + `continuous_start_year` exigidos pelo MCTI.

### 2.3 Registrar ativos PD&I
* **Tipo:** Cadastro
* **Descrição:** Equipamentos e intangíveis com método de depreciação e % de uso em PD&I.
* **Tabelas Envolvidas:** `rdi_assets`
* **Dependências:** Empresa cadastrada
* **Regras de Negócio:**
    * **Exclusivo PD&I:** Depreciação acelerada integral (Art. 17 III) — 100% no exercício.
    * **Misto:** Cota proporcional ao % horas de uso em PD&I.
    * **NF vinculada:** Documento de aquisição linkado ao ativo.
    * **Justificativa:** Obrigatória para ativos de uso misto.

---

## 💰 M3: Financeiro (Importação financeira e fiscal)
**Objetivo:** Ingestão de Folha, despesas, documentos fiscais e demonstrações contábeis.

### 3.1 Configurar template de importação de folha
* **Tipo:** Configuração
* **Descrição:** Template configurável por sistema de origem (Totvs, ADP, etc). Versionado para suportar mudança de layout sem quebrar histórico.
* **Tabelas Envolvidas:** `payroll_import_templates`, `payroll_import_template_versions`, `payroll_import_column_maps`
* **Dependências:** Empresa cadastrada, Catálogo de rubricas configurado
* **Regras de Negócio:**
    * **Tipos:** EXCEL, CSV, PDF_ESTRUTURADO, PDF_OCR_IA, API.
    * **Versionamento:** `valid_from`/`valid_until`. Mudança de layout = nova versão.
    * **Estrutura:** `layout_config` (JSON específico por tipo de arquivo).

### 3.2 Importar folha de pagamento
* **Tipo:** Importação
* **Descrição:** Upload → Staging → Mapeamento de rubricas → Validação → Promoção.
* **Tabelas Envolvidas:** `payroll_import_jobs`, `payroll_import_staging_rows`, `payroll_import_staging_items`, `payroll_sheets`, `payroll_sheet_items`, `payroll_employer_charges`
* **Dependências:** Template configurado, Colaboradores importados
* **Regras de Negócio:**
    * **Bloqueio:** Item em staging com `PENDENTE_MAPEAMENTO` impede a promoção para o banco principal.
    * **Competência:** Ano fiscal = `YEAR(competence_date)`, não a data de upload.
    * **Granularidade:** Uma linha por rubrica em `payroll_sheet_items`.

### 3.3 Importar NFs e contratos de despesa
* **Tipo:** Importação
* **Descrição:** NFe, NFSe, contratos, recibos. Arquivo original preservado no storage. Competência fiscal obrigatória.
* **Tabelas Envolvidas:** `rdi_expense_documents`
* **Dependências:** Empresa cadastrada
* **Regras de Negócio:**
    * **Preservação:** `s3_key` — arquivo raw nunca é descartado.
    * **Competência:** `competence_date` pode diferir da data de emissão.
    * **Subvenção:** Flag de origem FINEP/BNDES para vedação Art. 17 §2º.

### 3.4 Importar timesheets externos
* **Tipo:** Importação
* **Descrição:** Registros brutos de horas de sistemas externos (Jira, Toggl). Cruzados com a folha na alocação ao projeto.
* **Tabelas Envolvidas:** `rdi_timesheet_entries`
* **Dependências:** Colaboradores importados, Projetos cadastrados
* **Regras de Negócio:**
    * **Granularidade:** Por dia × colaborador × projeto.
    * **Evidência:** `activity_desc` atua como justificativa auditável pelo MCTI.
    * **Status:** IMPORTADO → VALIDADO → VINCULADO_FOLHA.

### 3.5 Importar demonstrações contábeis
* **Tipo:** SPED / Extensível
* **Descrição:** ECD (SPED txt), DRE, Balanço Patrimonial. Módulo independente que não bloqueia o fluxo de apuração de PD&I.
* **Tabelas Envolvidas:** `financial_statements`, `financial_statement_lines`
* **Dependências:** Empresa cadastrada, Exercício fiscal configurado
* **Regras de Negócio:**
    * **Finalidade:** Cruzamento de dispêndios PD&I × contabilidade.
    * **Prazo legal:** ECD em 31/julho (deve estar importado antes da geração).

---

## ⚙️ M4: Apuração (Cálculo do período fiscal)
**Objetivo:** Elegibilidade, alocação de dispêndios aos projetos e fechamento do snapshot.

### 4.1 Curadoria de elegibilidade de rubricas
* **Tipo:** Revisão humana
* **Descrição:** Consultor revisa em lote rubricas não classificadas. Define elegibilidade com fundamentação legal.
* **Tabelas Envolvidas:** `payroll_rubric_catalog`, `payroll_sheet_items`
* **Dependências:** Folha importada e promovida
* **Regras de Negócio:**
    * **Hierarquia:** Override de item > catálogo empresa > default sistema.
    * **Rastreabilidade:** `reviewed_by` + `reviewed_at` obrigatórios.
    * **Fundamentação:** `eligibility_legal_basis` documenta critério para o MCTI.

### 4.2 Alocar RH ao projeto (por mês)
* **Tipo:** Cálculo
* **Descrição:** Define % dedicação do colaborador ao projeto/mês. Calcula base elegível e encargos. Detalha por rubrica em allocation_items.
* **Tabelas Envolvidas:** `rdi_hr_allocations`, `rdi_hr_allocation_items`
* **Dependências:** Folha aprovada, Projetos cadastrados, Rubricas classificadas
* **Regras de Negócio:**
    * **Métodos:** PERCENTUAL_FIXO, HORAS_APONTADAS, RATEIO_ATIVIDADE.
    * **Controle:** Soma `pct_allocation` ≤ 100% imposta pela aplicação.
    * **Snapshot:** Cria o `snapshot_id` automaticamente se inexistente.

### 4.3 Alocar despesas diretas ao projeto
* **Tipo:** Cálculo
* **Descrição:** Aloca NFs e contratos via DIRETO (100%) ou RATEIO (%, m², horas). Deduz subvenção econômica.
* **Tabelas Envolvidas:** `rdi_expense_allocations`
* **Dependências:** NFs importadas, Timesheets validados, Taxas rateio configuradas
* **Regras de Negócio:**
    * **Vedação:** `subvention_amount` deduzida ANTES de compor a base elegível.
    * **Justificativa:** Obrigatória para critérios de rateio.
    * **Rastreabilidade:** `expense_doc_id` → `allocated_amount` → `snapshot_id`.

### 4.4 Gerar cotas de depreciação
* **Tipo:** Automático
* **Descrição:** Cálculo automático das cotas mensais. Exclusivos: integral no ano. Mistos: cota linear × % uso PD&I.
* **Tabelas Envolvidas:** `rdi_asset_depreciation_entries`
* **Dependências:** Ativos cadastrados
* **Regras de Negócio:**
    * **Cálculo (Misto):** `gross_depreciation` × (`rdi_eligible_pct` / 100).
    * **LALUR:** Campo `lalur_ref` cruza com a escrituração fiscal.

### 4.5 Alocar overhead ao projeto
* **Tipo:** Cálculo
* **Descrição:** Despesas operacionais (aluguel, energia, limpeza) rateadas por base justificável vinculada ao M1.
* **Tabelas Envolvidas:** `rdi_expense_allocations`, `rdi_overhead_rates`
* **Dependências:** Configurações anuais, NFs de overhead importadas
* **Regras de Negócio:**
    * **Tipos:** ALUGUEL_LAB, ENERGIA, AGUA, LIMPEZA, etc.
    * **Justificativa / Doc:** `supporting_doc_ref` exige planta baixa ou laudo anexado.

### 4.6 Fechar snapshot anual
* **Tipo:** Fechamento (Imutabilidade)
* **Descrição:** Consolida RH + despesas + depreciação + overhead do ano-base. Congela os dados para imutabilidade.
* **Tabelas Envolvidas:** `rdi_project_annual_snapshots`
* **Dependências:** Alocações validadas, despesas alocadas, staging vazio
* **Regras de Negócio:**
    * **Imutabilidade:** `status` = FECHADO bloqueia novas inserções ou edições no banco (`ON DELETE RESTRICT`).
    * **Horas MCTI:** Calcula totais de `total_researcher_hours` e contagem de pesquisadores.

---

## ⚙️ M5: Config. Anual e Obrigações
**Objetivo:** Parâmetros do exercício, LALUR e calendário de obrigações periódicas.

### 5.1 Configurar parâmetros do exercício fiscal
* **Tipo:** Configuração
* **Descrição:** Alíquotas IRPJ/CSLL, limites de exclusão adicional, referência ao LALUR.
* **Tabelas Envolvidas:** `company_fiscal_year_config`
* **Dependências:** Empresa cadastrada
* **Regras de Negócio:**
    * **Base Exclusão:** Padrão 60% sobre despesas operacionais PD&I.
    * **Adicionais:** +10% ou +20% (incremento de pesquisadores), +20% (patente concedida).

### 5.2 Configurar calendário de obrigações
* **Tipo:** Automático
* **Descrição:** Vencimentos (ECD, ECF, DIRBI, FORMP&D) com alertas configuráveis e histórico de envios.
* **Tabelas Envolvidas:** `company_obligations`, `obligation_calendar`
* **Dependências:** Empresa cadastrada, Exercício configurado
* **Regras de Negócio:**
    * **Status:** PENDENTE → EM_PREPARACAO → ENVIADO → CONFIRMADO.
    * **Alertas:** Notificações disparadas 30, 15 ou 7 dias antes do vencimento.

---

## 📄 M6: Prestação de Contas (Saída)
**Objetivo:** FORMP&D, ECD, ECF, DIRBI — geração, validação e envio.

### 6.1 Mapear projetos e montar FORMP&D
* **Tipo:** Saída MCTI
* **Descrição:** Mapeia snapshots fechados para projetos FORMP&D (agrupamento N internos : 1 oficial).
* **Tabelas Envolvidas:** `formpd_forms`, `formpd_projects`, `formpd_project_mapping`, `formpd_form_representatives`
* **Dependências:** Snapshots fechados, Projetos mapeados
* **Regras de Negócio:**
    * **Agrupamento:** Tabela pivot `formpd_project_mapping` permite N:1.
    * **Horas:** Total anual de horas por pesquisador é campo exigido pelo MCTI.

### 6.2 Calcular e registrar incentivos fiscais
* **Tipo:** Cálculo fiscal
* **Descrição:** Consolida total elegível, aplica alíquotas da categoria, calcula exclusão adicional.
* **Tabelas Envolvidas:** `formpd_fiscal_incentives`, `ecf_lalur_entries`
* **Dependências:** FORMP&D montado, Snapshot fechado
* **Regras de Negócio:**
    * **Alíquotas Aplicadas:** 60%, 70% ou 80% + Adicionais (Pesquisadores/Patentes).
    * **Saída:** Linhas convertidas para lançamento no SPED ECF.

### 6.3 Gerar e validar ECD (SPED) e ECF
* **Tipo:** SPED (Saída)
* **Descrição:** Geração de arquivos TXT SPED baseados nos cruzamentos contábeis.
* **Tabelas Envolvidas:** `financial_statements`, `ecd_exports`, `ecf_lalur_entries`, `ecf_exports`
* **Dependências:** DRE/Balanço importados, Incentivos calculados
* **Regras de Negócio:**
    * **Destino:** Layout oficial da Receita Federal (Portal SPED).
    * **Prazo:** 31 de Julho do ano seguinte.

### 6.4 Gerar DIRBI mensal
* **Tipo:** DIRBI (Saída)
* **Descrição:** Declaração mensal dos benefícios fiscais usufruídos (Lei do Bem tem código específico).
* **Tabelas Envolvidas:** `dirbi_monthly_records`, `dirbi_exports`
* **Dependências:** Alocações mensais finalizadas
* **Regras de Negócio:**
    * **Periodicidade:** Mensal, até dia 20 do mês subsequente.

---

## 📈 M7: Acompanhamento (Ciclo MCTI)
**Objetivo:** Monitoramento de pareceres, glosas, contestações e recursos administrativos.

### 7.1 Monitorar status do FORMP&D e Pareceres Técnicos
* **Tipo:** Monitoramento / Gestão
* **Descrição:** Acompanha o ciclo de análise. Registra ciência da empresa e o parecer oficial (Aprovado, Glosado, etc).
* **Tabelas Envolvidas:** `formpd_forms`, `formpd_opinions`
* **Dependências:** FORMP&D enviado ao MCTI
* **Regras de Negócio:**
    * **Granularidade:** Parecer pode ser vinculado ao `form_id` (Geral) ou `project_id` (Específico).
    * **Trigger Prazo:** O campo de "ciência" (`awareness_date`) aciona o cronômetro legal de 60 dias para defesa.

### 7.2 Defesa Administrativa (Contestação e Recurso)
* **Tipo:** Contestação / Recurso (Fluxo Jurídico)
* **Descrição:** Permite registrar justificativas técnicas contra Glosas em 1ª Instância (Contestação) e 2ª Instância (Recurso).
* **Tabelas Envolvidas:** `formpd_opinions`
* **Dependências:** Parecer Glosado ou Aprovado Parcialmente
* **Regras de Negócio:**
    * **Dados exigidos:** `contest_justification` + `supporting_doc_ref`.
    * **Impacto no Sistema:** Decisões de deferimento ou indeferimento do MCTI disparam o recálculo final da base elegível retroativa.

### 7.3 Dashboard consolidado de obrigações
* **Tipo:** Dashboard Automático
* **Descrição:** Visão agregada de prazos, status FORMP&D e pendências (Visão multi-tenant para consultores).
* **Tabelas Envolvidas:** `company_obligations`, `formpd_forms`, `formpd_opinions`, `obligation_calendar`
* **Dependências:** Todas entidades preenchidas
* **Regras de Negócio:**
    * Consolida dados para exportação de Relatórios de Compliance em auditorias.

---
**Fim do Documento de Especificação.** *Agentes: Usem este esquema para estruturar os endpoints da API, restrições ORM (Foreign Keys e Enums) e arquitetura de componentes do Frontend.*