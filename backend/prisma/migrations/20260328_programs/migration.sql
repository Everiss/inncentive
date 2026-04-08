-- Migration: Programas — gestão operacional de incentivos fiscais
-- Date: 2026-03-28
--
-- Contexto: Um Programa é o ciclo operacional que ANTECEDE a obrigação (FORMp&D, etc.)
-- para um determinado produto de incentivo (Lei do Bem, Lei da Informática, Rota 2030).
-- Agrupa projetos, despesas, evidências e executa as etapas de coleta, análise,
-- cálculo, auditoria e entrega antes da submissão obrigatória.

-- =============================================================================
-- 1. programs
--    Entidade principal. Uma por empresa + produto + ano-base.
-- =============================================================================

CREATE TABLE IF NOT EXISTS programs (
  id                    INT              NOT NULL AUTO_INCREMENT,
  company_id            INT              NOT NULL,
  incentive_type        ENUM(
                          'LEI_DO_BEM',
                          'LEI_DA_INFORMATICA',
                          'ROTA_2030'
                        )                NOT NULL,
  base_year             SMALLINT         NOT NULL COMMENT 'Ano-base fiscal, ex: 2024',
  status                ENUM(
                          'RASCUNHO',
                          'EM_ANDAMENTO',
                          'EM_REVISAO',
                          'FINALIZADO',
                          'SUBMETIDO'
                        )                NOT NULL DEFAULT 'RASCUNHO',
  title                 VARCHAR(255)     NULL     COMMENT 'Título customizado, ex: Lei do Bem 2024',
  responsible_contact_id INT             NULL,
  notes                 TEXT             NULL,
  formpd_form_id        INT              NULL     COMMENT 'Formulário Lei do Bem resultante',
  created_at            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_program_company_type_year (company_id, incentive_type, base_year),
  INDEX idx_programs_company       (company_id),
  INDEX idx_programs_status        (status),
  INDEX idx_programs_formpd        (formpd_form_id),
  INDEX idx_programs_responsible   (responsible_contact_id),
  CONSTRAINT fk_programs_company
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_programs_responsible
    FOREIGN KEY (responsible_contact_id) REFERENCES contacts (id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT fk_programs_formpd
    FOREIGN KEY (formpd_form_id) REFERENCES formpd_forms (id) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- 2. program_stages
--    Etapas operacionais do programa (pipeline de trabalho).
-- =============================================================================

CREATE TABLE IF NOT EXISTS program_stages (
  id                    INT              NOT NULL AUTO_INCREMENT,
  program_id            INT              NOT NULL,
  stage_type            ENUM(
                          'COLETA_DADOS',
                          'ANALISE_ELEGIBILIDADE',
                          'DEFINICAO_ESTRATEGIA',
                          'CALCULO_AGRUPAMENTO',
                          'ENTREGAVEIS_INICIAIS',
                          'AUDITORIA_VALIDACAO',
                          'EVIDENCIAS_FISCAIS',
                          'ELABORACAO_OBRIGACAO'
                        )                NOT NULL,
  status                ENUM(
                          'PENDENTE',
                          'EM_ANDAMENTO',
                          'CONCLUIDO',
                          'NAO_APLICAVEL'
                        )                NOT NULL DEFAULT 'PENDENTE',
  title                 VARCHAR(255)     NULL     COMMENT 'Título customizado da etapa',
  notes                 TEXT             NULL,
  due_date              DATE             NULL,
  completed_at          DATETIME         NULL,
  assigned_contact_id   INT              NULL,
  sort_order            TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stage_program_type (program_id, stage_type),
  INDEX idx_stages_program         (program_id),
  INDEX idx_stages_status          (status),
  INDEX idx_stages_assigned        (assigned_contact_id),
  CONSTRAINT fk_stages_program
    FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_stages_assigned
    FOREIGN KEY (assigned_contact_id) REFERENCES contacts (id) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- 3. program_documents
--    Evidências e documentos vinculados ao programa:
--    ECF, ECD, DIRBI, balancete, folha, timesheet, NF, contrato, laudo técnico.
-- =============================================================================

CREATE TABLE IF NOT EXISTS program_documents (
  id                    INT              NOT NULL AUTO_INCREMENT,
  program_id            INT              NOT NULL,
  doc_type              ENUM(
                          'ECF',
                          'ECD',
                          'DIRBI',
                          'BALANCETE',
                          'RELATORIO_LINHA_PESQUISA',
                          'FOLHA_PAGAMENTO',
                          'TIMESHEET',
                          'NOTA_FISCAL',
                          'CONTRATO',
                          'LAUDO_TECNICO',
                          'OUTRO'
                        )                NOT NULL,
  description           VARCHAR(500)     NULL,
  reference_year        SMALLINT         NULL,
  reference_period      VARCHAR(20)      NULL     COMMENT 'ex: 2024-01, 2024-Q1',
  file_id               VARCHAR(36)      NULL,
  external_ref          VARCHAR(255)     NULL     COMMENT 'protocolo, número de recibo, etc.',
  notes                 TEXT             NULL,
  created_at            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_prog_docs_program       (program_id),
  INDEX idx_prog_docs_type          (doc_type),
  INDEX idx_prog_docs_file          (file_id),
  CONSTRAINT fk_prog_docs_program
    FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_prog_docs_file
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- 4. program_rdi_projects
--    Junction: quais projetos RDI fazem parte deste programa.
-- =============================================================================

CREATE TABLE IF NOT EXISTS program_rdi_projects (
  program_id            INT              NOT NULL,
  rdi_project_id        INT              NOT NULL,
  created_at            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (program_id, rdi_project_id),
  INDEX idx_prp_project            (rdi_project_id),
  CONSTRAINT fk_prp_program
    FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_prp_rdi_project
    FOREIGN KEY (rdi_project_id) REFERENCES rdi_projects (id) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
