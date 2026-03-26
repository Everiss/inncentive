# DATABASE.md - Referencia de Dados

Guia de documentacao: [README_DOCS.md](./README_DOCS.md)
Ultima atualizacao: 2026-03-26

## 1. Estrategia atual

O sistema usa separacao por responsabilidade em 5 bancos MySQL:

- `new_tax_db` (banco principal da aplicacao)
- `new_tax_ia` (banco exclusivo do modulo IA)
- `new_tax_extractor` (banco do microservico de extracao deterministica)
- `new_tax_fileserver` (banco exclusivo do file-hub/fileserver)
- `new_tax_imports` (banco exclusivo do import-service tabular)

## 2. Bancos e ownership

### 2.1 new_tax_db

Contem os modulos de negocio:

- core: `companies`, `contacts`, `collaborators`, `users`
- formpd: `formpd_forms`, `formpd_projects` e subtabelas
- rdi/payroll/fiscal e demais modulos operacionais

Observacao:

- Objetos `files` e `file_*` foram removidos de `new_tax_db`.
- FKs legadas de importacao para arquivos foram removidas para permitir isolamento fisico.

### 2.5 new_tax_imports

Contem exclusivamente tabelas de importacao tabular multi-template:

- `import_templates`
- `import_batches`
- `import_rows`
- `import_events`

### 2.2 new_tax_ia

Contem exclusivamente:

- `ia_task_configs`
- `ia_prompts`
- `ia_model_pricing`
- `ia_executions`

Observacao:

- Objetos `ia_*` foram removidos do `new_tax_db`.
- O banco pode ser consumido por servicos dedicados de IA fora do backend principal.

### 2.3 new_tax_extractor

Contem telemetria e rastreabilidade da extracao:

- `extraction_requests`
- `extraction_fields`
- `extraction_artifacts`
- `extraction_events`
- `manual_ai_requests`

Observacao:

- Tabelas `extraction_*` e `manual_ai_*` nao devem existir no `new_tax_db`.

### 2.4 new_tax_fileserver

Contem exclusivamente tabelas de rastreabilidade/metadata de arquivo:

- `files`
- `file_intakes`
- `file_jobs`
- `file_events`
- `file_artifacts`

## 3. Usuarios de servico (privilegio minimo)

- `new_tax_app_svc@localhost` -> `new_tax_db.*`
- `new_tax_ia_svc@localhost` -> `new_tax_ia.*`
- `pdf_extractor_svc@localhost` -> `new_tax_extractor.*`
- `file_hub_svc@localhost` -> `new_tax_fileserver.*`
- `import_svc@localhost` -> `new_tax_imports.*`

Privilegios por schema:

- `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES`

## 4. Conexoes utilizadas

### backend

- `DATABASE_URL` -> `new_tax_db` (usuario `new_tax_app_svc`)

### pdf-extractor

- `PDF_EXTRACTOR_DB_URL` -> `new_tax_extractor` (usuario `pdf_extractor_svc`)

### file-hub

- `FILE_HUB_DATABASE_URL` -> `new_tax_fileserver` (usuario `file_hub_svc`)

### import-service

- `IMPORT_SERVICE_DATABASE_URL` -> `new_tax_imports` (usuario `import_svc`)

## 5. Convencoes de integridade

- Arquivo canonical por hash SHA-256 em `files.sha256`.
- Rastreabilidade obrigatoria por intake/job/evento.
- IDs mistos por dominio:
  - core historico com `INT AUTO_INCREMENT`.
  - filehub/ia com `UUID VARCHAR(36)` em partes criticas.

## 6. Observacoes importantes

- `file_intakes` nao possui `created_at`; usar `id` ou timestamps proprios (`received_at`, etc.).
- Em mudancas de schema Prisma, sempre executar `prisma generate` apos migracao.
- IA e extracao estao isoladas fisicamente para seguranca, auditoria e escalabilidade.
