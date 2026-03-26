CREATE DATABASE IF NOT EXISTS new_tax_imports CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE new_tax_imports;

CREATE TABLE IF NOT EXISTS import_templates (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  file_type VARCHAR(10) NOT NULL,
  header_row INT NOT NULL DEFAULT 0,
  column_map JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_batches (
  id VARCHAR(36) PRIMARY KEY,
  template_id VARCHAR(36) NOT NULL,
  source_filename VARCHAR(500) NOT NULL,
  storage_path VARCHAR(1000) NOT NULL,
  status VARCHAR(20) NOT NULL,
  total_rows INT NOT NULL DEFAULT 0,
  processed_rows INT NOT NULL DEFAULT 0,
  success_rows INT NOT NULL DEFAULT 0,
  error_rows INT NOT NULL DEFAULT 0,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_import_batch_template FOREIGN KEY (template_id) REFERENCES import_templates(id)
);

CREATE TABLE IF NOT EXISTS import_rows (
  id VARCHAR(36) PRIMARY KEY,
  batch_id VARCHAR(36) NOT NULL,
  row_index INT NOT NULL,
  payload_json JSON NOT NULL,
  status VARCHAR(20) NOT NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_import_row_batch FOREIGN KEY (batch_id) REFERENCES import_batches(id)
);

CREATE TABLE IF NOT EXISTS import_events (
  id VARCHAR(36) PRIMARY KEY,
  batch_id VARCHAR(36) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSON NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_import_event_batch FOREIGN KEY (batch_id) REFERENCES import_batches(id)
);

INSERT IGNORE INTO import_templates (
  id, code, name, entity_type, file_type, header_row, column_map, is_active
) VALUES (
  '34ec0cc4-5aa8-4cb1-b7ff-7ee31caaf889',
  'companies_basic_v1',
  'Companies Basic v1',
  'COMPANIES',
  'XLSX',
  0,
  JSON_OBJECT('CNPJ','cnpj','Razao Social','legal_name','Nome Fantasia','trade_name','Email','email'),
  1
), (
  '938e8c53-432a-4b88-a8b0-58729cd2e7e7',
  'contacts_basic_v1',
  'Contacts Basic v1',
  'CONTACTS',
  'CSV',
  0,
  JSON_OBJECT('Nome','name','Email','email','Telefone','phone','CPF','cpf'),
  1
);
