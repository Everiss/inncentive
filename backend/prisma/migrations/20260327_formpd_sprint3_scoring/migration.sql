-- Migration: formpd Sprint 3 — tabelas de auditoria e scoring
-- Date: 2026-03-27
--
-- Contexto: pdf-extractor agora retorna score estruturado no payload.
-- O backend deve persistir esses dados nas tabelas abaixo após cada
-- extração determinística ou IA, permitindo:
--   - rastreabilidade campo a campo (formpd_field_extractions)
--   - score de acurácia consultável na UI de revisão (formpd_extraction_scores)

-- =============================================================================
-- 1. formpd_field_extractions
--    Persistência campo a campo: qual valor foi extraído, de que trecho do PDF,
--    com que confiança e por qual método (DETERMINISTIC | AI | MANUAL).
-- =============================================================================

CREATE TABLE IF NOT EXISTS formpd_field_extractions (
  id            BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  form_id       INT              NOT NULL,
  project_id    INT              NULL       COMMENT 'NULL = campos de formpd_forms/company',
  field_path    VARCHAR(128)     NOT NULL   COMMENT 'ex: projects[1].hr[0].cpf | submission_receipt.sender_name',
  value_json    JSON             NULL       COMMENT 'valor extraído em JSON (string, number, bool, array)',
  raw_text      TEXT             NULL       COMMENT 'trecho exato do PDF que gerou o valor',
  confidence    DECIMAL(3,2)     NOT NULL DEFAULT 0.00 COMMENT '0.00–1.00',
  source        ENUM('DETERMINISTIC','AI','MANUAL') NOT NULL DEFAULT 'DETERMINISTIC',
  form_version  VARCHAR(20)      NULL       COMMENT 'v1_2017|v2_late|v3_early|v3_late...',
  extracted_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_field_extraction (form_id, project_id, field_path, source),
  INDEX idx_ffe_form     (form_id),
  INDEX idx_ffe_project  (project_id),
  INDEX idx_ffe_conf     (confidence),
  INDEX idx_ffe_source   (source),
  CONSTRAINT fk_ffe_form
    FOREIGN KEY (form_id) REFERENCES formpd_forms (id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_ffe_project
    FOREIGN KEY (project_id) REFERENCES formpd_projects (id) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- 2. formpd_extraction_scores
--    Score de acurácia por formulário (project_id NULL) ou por projeto.
--    Populado pelo backend após cada extração determinística ou IA.
-- =============================================================================

CREATE TABLE IF NOT EXISTS formpd_extraction_scores (
  id                      INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  form_id                 INT           NOT NULL,
  project_id              INT           NULL       COMMENT 'NULL = score do formulário inteiro',
  form_version            VARCHAR(20)   NOT NULL   COMMENT 'v1_2017|v2_late|v3_early|v3_late...',

  -- Completude de campos obrigatórios Lei do Bem
  mandatory_total         INT           NOT NULL DEFAULT 0,
  mandatory_found         INT           NOT NULL DEFAULT 0,
  completeness_pct        DECIMAL(5,2)  NOT NULL DEFAULT 0.00,

  -- Cobertura financeira
  hr_records              INT           NOT NULL DEFAULT 0,
  expenses_records        INT           NOT NULL DEFAULT 0,
  equipment_records       INT           NOT NULL DEFAULT 0,
  declared_total          DECIMAL(18,2) NULL       COMMENT 'da tabela-resumo v3',
  extracted_total         DECIMAL(18,2) NULL       COMMENT 'soma do que foi extraído',
  financial_coverage_pct  DECIMAL(5,2)  NULL,

  -- Confiança média
  avg_confidence          DECIMAL(3,2)  NOT NULL DEFAULT 0.00,
  high_conf_fields        INT           NOT NULL DEFAULT 0,
  low_conf_fields         INT           NOT NULL DEFAULT 0,

  -- Cross-validation flags (CV-01 a CV-09)
  cv_01_cnpj_valid        TINYINT(1)    NULL,
  cv_02_year_valid        TINYINT(1)    NULL,
  cv_03_receipt_complete  TINYINT(1)    NULL,
  cv_04_has_expenses      TINYINT(1)    NULL,
  cv_05_project_count     TINYINT(1)    NULL,
  cv_06_financial_total   TINYINT(1)    NULL,
  cv_07_auth_code_format  TINYINT(1)    NULL,
  cv_08_has_hr            TINYINT(1)    NULL,
  cv_09_category_valid    TINYINT(1)    NULL,

  -- Score final
  overall_score           DECIMAL(5,2)  NOT NULL DEFAULT 0.00 COMMENT '0.00–100.00',
  score_band              ENUM('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'LOW',
  needs_ai                TINYINT(1)    NOT NULL DEFAULT 1,
  ai_priority_fields      JSON          NULL       COMMENT 'campos críticos para IA completar',

  scored_at               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scorer_version          VARCHAR(20)   NOT NULL DEFAULT 'v2',

  PRIMARY KEY (id),
  UNIQUE KEY uq_score (form_id, project_id, scorer_version),
  INDEX idx_fes_form     (form_id),
  INDEX idx_fes_score    (overall_score),
  INDEX idx_fes_needs_ai (needs_ai),
  INDEX idx_fes_band     (score_band),
  CONSTRAINT fk_fes_form
    FOREIGN KEY (form_id) REFERENCES formpd_forms (id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_fes_project
    FOREIGN KEY (project_id) REFERENCES formpd_projects (id) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- Verificação pós-migração
-- =============================================================================
-- SHOW CREATE TABLE formpd_field_extractions\G
-- SHOW CREATE TABLE formpd_extraction_scores\G
