# Master Architecture & Data Dictionary: Inncentive (Lei do Bem)
**Versão:** 1.0 (Consolidada com Motor de Cálculo e Views Estruturais)
**Objetivo:** Guiar a equipe de desenvolvimento (Backend, DBAs e Frontend) sobre a estrutura final de dados, motor de apuração e fluxo de consolidação para o MCTI.

---

## 🔐 1. Controle de Acesso e Multi-tenant (M1)
O sistema suporta que Consultorias atendam múltiplos clientes com controle de acesso granular.

* **`user_company_access`:** Substitui lógicas antigas. Gerencia os perfis (`OWNER`, `CONSULTANT`, `ANALYST`, `VIEWER`). Possui data de expiração (`expires_at`) ideal para auditorias de segurança.
* **`companies` & `contacts`:** O core multi-tenant. Contatos (pessoas físicas) são isolados e associados a usuários e/ou colaboradores de uma ou mais empresas.

---

## 👥 2. RH e Controle de Horas (M2 e M3)
O sistema dissocia a folha de pagamento bruta da real alocação de tempo nos projetos.

* **`collaborators`:** Agora atende às regras do FORMP&D através das colunas `employment_type` (CLT, Bolsista), `academic_degree` (Doutor, Mestre) e `is_researcher`.
* **`rdi_timesheet_entries`:** Permite ingestão de horas de sistemas terceiros (Jira, Ponto eletrônico). A coluna `activity_desc` serve como prova de auditoria contra glosas do MCTI.
* **`payroll_sheets` & `payroll_sheet_items`:** O reflexo da folha de pagamento aprovada. A tabela `payroll_employer_charges` armazena o custo oculto da empresa (INSS Patronal, RAT, Terceiros).

---

## ⚙️ 3. O Motor Universal de Dispêndios (M4)
O coração financeiro do sistema. Todas as despesas, independentemente da origem, convergem para a tabela de alocação de despesas ou de RH.

* **`rdi_assets` & `rdi_asset_depreciation_entries`:** Controla equipamentos e intangíveis. O cálculo da cota de depreciação mensal é feito automaticamente e gera um ID vinculável. Suporta depreciação acelerada (Art. 17 III).
* **`rdi_overhead_rates`:** Permite criação de regras de rateio (Aluguel, Energia) baseadas em percentual, M², horas ou medição direta, exigindo justificativa documental obrigatória (`justification`).
* **`rdi_expense_allocations` (A Tabela Unificadora):** * Recebe o custo das NFs, das cotas de Depreciação e do Overhead.
  * O `appropriation_type` audita como a despesa chegou ao projeto (DIRETO, RATEIO_M2, etc).
  * Deduz valores de subvenção automaticamente antes da base elegível (`subvention_amount`).

---

## 📊 4. The "Data Bridge": Views de Consolidação
Em vez de depender de processamentos pesados na API, o banco de dados pré-processa as regras do governo através de 4 Views de altíssimo valor agregado:

1. **`v_rh_dispendio_projeto_ano`:** Detalha linha a linha o custo efetivo de cada funcionário em cada projeto, já multiplicando a folha pelo `%` de dedicação (`pct_allocation`).
2. **`v_researcher_hours_annual`:** Resolve um gap clássico do FORMP&D: calcula automaticamente quantas horas um pesquisador dedicou ao projeto (lendo do timesheet se existir, ou deduzindo da alocação da folha como fallback).
3. **`v_rdi_project_year_totals`:** Agrega totais de RH e despesas por Snapshot para visões rápidas de Dashboard.
4. **`v_snapshot_dispendios_consolidado` (A View Core):** * Traduz as rubricas internas do Inncentive para as 6 caixas exatas exigidas pelo formulário do MCTI: `material_eligible`, `servicos_eligible`, `overhead_eligible`, `depreciation_eligible`, e `terceiros_eligible`.
   * Determina o `%` de exclusão adicional no LALUR dinamicamente baseado na categoria do projeto (`project_category`).

---

## 🏛️ 5. Prestação de Contas Oficial (M6 e M7)
Este módulo é protegido por chaves `ON DELETE RESTRICT` (A "Caixa Preta" fiscal), garantindo que dados de anos fechados sejam indestrutíveis.

* **O Agrupador:** `formpd_project_mapping` permite pegar `N` micro-projetos do Snapshot (`rdi_projects`) e fundi-los em `1` projeto gigante para o governo (`formpd_projects`), somando os custos da view.
* **O Formulário:** Tabelas `formpd_forms`, `formpd_project_human_resources`, `formpd_project_expenses`, `formpd_project_equipment` espelham perfeitamente os capítulos II e III do sistema web do MCTI.
* **Economia Real:** `formpd_fiscal_incentives` crava o valor de economia no IRPJ/CSLL, gerando a linha `lalur_reference` que o contador utilizará no SPED ECF.
* **Máquina de Estados Legal:** `formpd_opinions` rastreia a vida jurídica do incentivo: Ciência -> Prazo de 60 Dias -> Contestação (1ª Instância) -> Recurso (2ª Instância).

---

## 🚦 6. Constraint Guide para Desenvolvedores (ORM)
* **Imutabilidade:** O ID `snapshot_id` é o bloqueio central. Nenhuma query de `DELETE` ou `UPDATE` deve ser permitida pelo backend em entidades atreladas a um Snapshot com `snapshot_status = 'FECHADO'`.
* **Unique Keys (Duplicidade):** Capture erros `ER_DUP_ENTRY` e retorne `HTTP 409 Conflict` (Ex: tentar criar duas obrigações iguais para o mesmo mês na tabela `company_obligations`).
* **Tratamento de Decimais:** O sistema lida extensivamente com `DECIMAL(18,2)` (moeda) e `DECIMAL(7,4)` (percentuais). Garanta que bibliotecas ORM (ex: Prisma, TypeORM) estejam convertendo esses valores para `number` ou bibliotecas como `decimal.js` no frontend, evitando perda de precisão flutuante do JavaScript.
---

## 7. FileHub (Rastreabilidade Unificada de Arquivos)
Foi adicionado um backbone unificado para ingestão, deduplicação e auditoria de arquivos:

* `files`: registro canônico por hash `sha256` (dedup global de conteúdo).
* `file_intakes`: cada recebimento/upload de arquivo com status operacional.
* `file_jobs`: ciclo do processamento (queued, processing, done, error) e progresso (`progress_current`/`progress_total`).
* `file_artifacts`: saídas versionadas por job (JSON consolidado, resumo de lote, etc).
* `file_events`: trilha imutável de eventos para auditoria temporal.

Integrações de domínio:
* `import_batches.file_id` conecta lote ao arquivo canônico.
* `import_items.file_job_id` conecta item ao job de processamento.
* `ia_executions.file_job_id` conecta execuções de IA ao job.

---

## 8. Fila Redis: Módulo de Administração
Foi criado `QueueAdminModule` para governança operacional das filas BullMQ.

Rotas principais:
* `GET /queue-admin/queues/:name/status`
* `POST /queue-admin/queues/:name/pause`
* `POST /queue-admin/queues/:name/resume`
* `POST /queue-admin/batches/:id/requeue-pending`
* `POST /queue-admin/batches/:id/retry-failed`

Filas suportadas:
* `import-cnpjs`
* `formpd-extraction`

---

## 9. Deduplicação por Hash
### FORMP&D (PDF + IA)
* Hash `sha256` é calculado no upload.
* Busca cache por `file_sha256` em extrações anteriores.
* Em hit: novo lote é preenchido sem nova chamada de IA.

### Planilhas (`COMPANIES`, `CONTACTS`, `COLLABORATORS`, `PROJECTS`)
* Hash `sha256` é calculado no upload.
* Se houver lote `COMPLETED` para o mesmo `file_id`/conteúdo:
  * clone de itens/status para o novo lote;
  * sem reenfileirar processamento;
  * evento de dedup registrado no FileHub.

---

## 10. Observabilidade de Trace (Backend + Frontend)
Novas rotas de rastreabilidade:
* `GET /imports/batches/:id/trace`
* `GET /imports/file-jobs/:id/trace`

Componente de UI em Processamentos:
* Timeline por lote com filtros por `event_type`, `job_status` e período.
* Destaque visual de eventos de falha.
* Exportação de trilha: `JSON`, `JSON Full` e `CSV`.
* Ação de copiar JSON para clipboard.
