-- Migration: formpd Sprint 2 — cobertura de campos v3_late + correções de schema
-- Date: 2026-03-27
--
-- Contexto: parser pdf-extractor atualizado para extrair:
--   - nature, tech_area_label, is_continuous, aligns_public_policy, public_policy_ref
--   - TRL/MRL/STRL (initial/final) + trl_justification (AB2024+)
--   - financing_own_pct / financing_external_pct (v3)
--   - qualification, annual_hours, dedication_type, activity_description (HR)
--   - service_status, partner_type (expenses)
--   - form_version, disclosure_authorized (forms)
--
-- IMPORTANTE: Executar com Prisma fora do modo shadow (raw SQL).
-- Os campos foram verificados contra o schema atual para evitar duplicidade.

-- =============================================================================
-- 1. formpd_projects — campos novos do Sprint 2
-- =============================================================================

ALTER TABLE formpd_projects
  -- Natureza da atividade: PRODUTO | PROCESSO | SERVICO (todos os anos)
  ADD COLUMN nature                  VARCHAR(30)    NULL
    COMMENT 'PRODUTO|PROCESSO|SERVICO — natureza da atividade de PD&I',

  -- Área técnica geral (ÁREA DO PROJETO), separada da specific_area (ESPECIFICAR)
  ADD COLUMN tech_area_label         VARCHAR(255)   NULL
    COMMENT 'Área geral do projeto — ÁREA DO PROJETO (v2/v3)',

  -- Atividade contínua (Sim/Não)
  ADD COLUMN is_continuous           TINYINT(1)     NULL
    COMMENT 'A atividade/projeto é contínuo? 1=Sim 0=Não',

  -- Alinhamento com políticas públicas nacionais
  ADD COLUMN aligns_public_policy    TINYINT(1)     NULL
    COMMENT 'O projeto se alinha com políticas públicas? 1=Sim 0=Não',
  ADD COLUMN public_policy_ref       VARCHAR(500)   NULL
    COMMENT 'Referência ou texto de políticas públicas relacionadas',

  -- Escalas MRL e STRL (v3_late AB2024+, complementam TRL)
  ADD COLUMN mrl_initial             INT            NULL COMMENT 'Manufacturing Readiness Level inicial (v3_late)',
  ADD COLUMN mrl_final               INT            NULL COMMENT 'Manufacturing Readiness Level final (v3_late)',
  ADD COLUMN strl_initial            INT            NULL COMMENT 'System TRL inicial (v3_late)',
  ADD COLUMN strl_final              INT            NULL COMMENT 'System TRL final (v3_late)',

  -- Justificativa dos níveis de maturidade (novo em AB2024)
  ADD COLUMN trl_justification       MEDIUMTEXT     NULL
    COMMENT 'JUSTIFIQUE O(S) NÍVEL(IS) DE MATURIDADE — AB2024+',

  -- Fontes de financiamento do projeto (v3)
  ADD COLUMN financing_own_pct       DECIMAL(5,2)   NULL COMMENT 'RECURSOS PRÓPRIOS % (v3)',
  ADD COLUMN financing_external_pct  DECIMAL(5,2)   NULL COMMENT 'FINANCIAMENTOS % (v3)',

  -- Versão do formulário que originou os dados
  ADD COLUMN form_version            VARCHAR(20)    NULL
    COMMENT 'v1_2017|v1_2018|v2_early|v2_late|v3_early|v3_late — perfil do parser';


-- =============================================================================
-- 2. formpd_forms — rastreamento de versão + autorização de divulgação
-- =============================================================================

ALTER TABLE formpd_forms
  -- Versão do formulário MCTI (permite enriquecer retroativamente)
  ADD COLUMN form_version            VARCHAR(20)    NULL
    COMMENT 'v1_2017|v1_2018|v2_early|v2_late|v3_early|v3_late — detectado no upload',

  -- Nova pergunta em v3+: "A empresa autoriza a divulgação dos dados?"
  ADD COLUMN disclosure_authorized   TINYINT(1)     NULL
    COMMENT 'A empresa autoriza divulgação dos dados? Sim=1 Não=0 (v3+)';


-- =============================================================================
-- 3. formpd_project_human_resources — campos ausentes do parser v2/v3
-- =============================================================================

ALTER TABLE formpd_project_human_resources
  -- Titulação (Doutor, Mestre, Graduado...) — presente em todos os anos
  ADD COLUMN qualification           VARCHAR(100)   NULL
    COMMENT 'Titulação do pesquisador — Doutor|Mestre|Graduado|Especialização|Técnico',

  -- Total de horas anuais dedicadas ao projeto
  -- MCTI sempre reporta anuais; o schema anterior usava "monthly" incorretamente
  ADD COLUMN annual_hours            DECIMAL(8,2)   NULL
    COMMENT 'Total Horas (Anual) dedicadas ao projeto — valor reportado no FORMPD',

  -- Tipo de dedicação textual (complementa o booleano is_exclusive_researcher)
  ADD COLUMN dedication_type         VARCHAR(20)    NULL
    COMMENT 'EXCLUSIVA|PARCIAL — texto original do formulário',

  -- Descrição das atividades realizadas (v3: "Descreva as atividades...")
  ADD COLUMN activity_description    TEXT           NULL
    COMMENT 'Descrição das atividades realizadas pelo pesquisador (v3+)';


-- =============================================================================
-- 4. formpd_project_expenses — campos ausentes do parser v1/v2
-- =============================================================================

ALTER TABLE formpd_project_expenses
  -- Situação do serviço: TERMINADO | EM_EXECUCAO (v1/v2)
  ADD COLUMN service_status          VARCHAR(30)    NULL
    COMMENT 'Situação do serviço — TERMINADO|EM_EXECUCAO (v1/v2)',

  -- Tipo de parceiro para categorias especiais (v1/v2 extended)
  ADD COLUMN partner_type            VARCHAR(50)    NULL
    COMMENT 'MICRO_EMPRESA|EPP|INVENTOR_INDEPENDENTE|ICT|UNIVERSIDADE|INSTITUICAO_PESQUISA';


-- =============================================================================
-- Verificação rápida pós-migração
-- =============================================================================
-- SELECT COUNT(*) FROM formpd_projects WHERE form_version IS NOT NULL;
-- SELECT COUNT(*) FROM formpd_project_human_resources WHERE qualification IS NOT NULL;
-- SELECT COUNT(*) FROM formpd_project_expenses WHERE service_status IS NOT NULL;
