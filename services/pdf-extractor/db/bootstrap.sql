-- Bootstrap DB for pdf-extractor microservice
CREATE DATABASE IF NOT EXISTS new_tax_extractor
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'pdf_extractor_svc'@'localhost'
  IDENTIFIED BY 'PdfExtractor#2026!';

GRANT ALL PRIVILEGES ON new_tax_extractor.* TO 'pdf_extractor_svc'@'localhost';
FLUSH PRIVILEGES;

USE new_tax_extractor;

CREATE TABLE IF NOT EXISTS extraction_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id CHAR(36) NOT NULL,
  batch_id INT NULL,
  file_id VARCHAR(36) NULL,
  file_hash CHAR(64) NOT NULL,
  original_name VARCHAR(500) NULL,
  file_path VARCHAR(1000) NULL,
  parser_version VARCHAR(50) NOT NULL DEFAULT 'v1',
  status ENUM('RECEIVED','PROCESSING','COMPLETED','FAILED','NEEDS_AI') NOT NULL DEFAULT 'RECEIVED',
  confidence ENUM('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'LOW',
  needs_ai BOOLEAN NOT NULL DEFAULT FALSE,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_extraction_requests_request_id (request_id),
  KEY idx_extraction_requests_file_hash (file_hash),
  KEY idx_extraction_requests_status (status),
  KEY idx_extraction_requests_batch_id (batch_id),
  KEY idx_extraction_requests_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS extraction_fields (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id CHAR(36) NOT NULL,
  field_path VARCHAR(255) NOT NULL,
  source ENUM('DETERMINISTIC','OCR','MANUAL_AI','MANUAL_REVIEW') NOT NULL DEFAULT 'DETERMINISTIC',
  confidence DECIMAL(5,2) NULL,
  value_json JSON NULL,
  is_final BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_extraction_fields_request_field (request_id, field_path),
  KEY idx_extraction_fields_request (request_id),
  CONSTRAINT fk_extraction_fields_request
    FOREIGN KEY (request_id) REFERENCES extraction_requests(request_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS extraction_artifacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id CHAR(36) NOT NULL,
  artifact_type ENUM('RAW_TEXT','RAW_PAGE_TEXT','TABLES_JSON','NORMALIZED_JSON','CHUNK_TEXT','OCR_TEXT') NOT NULL,
  artifact_version INT NOT NULL DEFAULT 1,
  page_from INT NULL,
  page_to INT NULL,
  content_text LONGTEXT NULL,
  content_json JSON NULL,
  content_hash CHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_extraction_artifacts_unique (request_id, artifact_type, artifact_version, page_from, page_to),
  KEY idx_extraction_artifacts_request (request_id),
  CONSTRAINT fk_extraction_artifacts_request
    FOREIGN KEY (request_id) REFERENCES extraction_requests(request_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS extraction_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id CHAR(36) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  event_payload JSON NULL,
  actor VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_extraction_events_request (request_id),
  KEY idx_extraction_events_type (event_type),
  KEY idx_extraction_events_created_at (created_at),
  CONSTRAINT fk_extraction_events_request
    FOREIGN KEY (request_id) REFERENCES extraction_requests(request_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS manual_ai_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id CHAR(36) NOT NULL,
  batch_id INT NULL,
  status ENUM('QUEUED','PROCESSING','COMPLETED','FAILED','CANCELED') NOT NULL DEFAULT 'QUEUED',
  targeted_fields JSON NULL,
  targeted_candidates JSON NULL,
  requested_by VARCHAR(100) NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_manual_ai_requests_request (request_id),
  KEY idx_manual_ai_requests_status (status),
  CONSTRAINT fk_manual_ai_requests_request
    FOREIGN KEY (request_id) REFERENCES extraction_requests(request_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;
