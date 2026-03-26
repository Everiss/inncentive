-- Migration: expand import_items.record_data from TEXT (64KB) to MEDIUMTEXT (16MB)
-- Required for large FORMPD extractions with many projects/HR/expenses
ALTER TABLE import_items MODIFY COLUMN record_data MEDIUMTEXT NOT NULL;
