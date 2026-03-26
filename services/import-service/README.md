# Import Service

Microservico dedicado para importacao de arquivos Excel/CSV com suporte a multiplos templates.

## Capacidades

- cadastro/listagem de templates de importacao
- upload de arquivo por template
- parse de XLS/XLSX/CSV
- mapeamento de colunas conforme `column_map`
- persistencia de batches, rows e eventos em banco dedicado

## Rodar local

```bash
cd services/import-service
npm install
npm run dev
```

## Endpoints

- `GET /health`
- `GET /templates`
- `POST /templates`
- `POST /imports/upload?templateCode=...`
- `GET /imports/batches`
- `GET /imports/batches/:id`
- `GET /imports/batches/:id/rows`

## Banco dedicado

- DB: `new_tax_imports`
- Script bootstrap: `db/bootstrap.sql`
