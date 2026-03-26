-- Migration: add formpd_company_identification table
-- Date: 2026-03-26

CREATE TABLE IF NOT EXISTS `formpd_company_identification` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `form_id` INT NOT NULL,
  `company_type` VARCHAR(100) NULL,
  `company_status` VARCHAR(100) NULL,
  `benefits_law_11196_8248` VARCHAR(100) NULL,
  `capital_origin` VARCHAR(100) NULL,
  `group_relationship` VARCHAR(100) NULL,
  `gross_operational_revenue` DECIMAL(18,2) NULL,
  `net_revenue` DECIMAL(18,2) NULL,
  `employee_count_with_contract` INT NULL,
  `closed_year_with_tax_loss` TINYINT(1) NULL,
  `irpj_csll_apportionment` VARCHAR(100) NULL,
  `incentives_reason` TEXT NULL,
  `rnd_organizational_structure` TEXT NULL,
  `qa_json` JSON NULL,
  `raw_text` MEDIUMTEXT NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_formpd_company_identification_form` (`form_id`),
  KEY `idx_formpd_company_identification_form` (`form_id`),
  CONSTRAINT `fk_formpd_company_identification_form`
    FOREIGN KEY (`form_id`) REFERENCES `formpd_forms` (`id`)
    ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
