# SERVICES.md - Catalogo de Servicos

Guia de documentacao: [README_DOCS.md](./README_DOCS.md)
Ultima atualizacao: 2026-03-26

## 1. Visao geral

Servicos ativos no ecossistema `new-tax`:

- `frontend` (React/Vite)
- `backend` (NestJS)
- `valkey` (Redis para BullMQ)
- `pdf-extractor` (FastAPI)
- `ai-service` (FastAPI)
- `file-hub` (Node/Express)
- `import-service` (Node/Express)
- `notification-service` (Node/Express + Socket.IO)

Startup unificado pela raiz:

```bash
# tudo (app + microservicos)
npm run start

# tudo (fallback Windows sem concurrently)
npm run dev

# somente app (backend + frontend)
npm run start:app

# somente microservicos Node
npm run start:services:node

# somente microservicos Python
npm run start:services:python
```

Atalho PowerShell na raiz:

```powershell
.\.start.ps1 all
.\.start.ps1 app
.\.start.ps1 node
.\.start.ps1 python
```

Notas:

- `npm run dev` usa `.\.start.ps1 all` e abre processos separados por servico (fallback para ambientes Windows com erro `spawn EPERM` no `concurrently`).
- `npm run start:*` mantem o modo antigo com `concurrently`.

## 2. Frontend

- Tecnologia: React + Vite
- Porta padrao: `5173`
- Responsabilidade:
  - UI de operacao (Forms, Processamentos, revisao de lotes)
  - Acompanhamento de status e trace

Startup:

```bash
cd frontend
npm run dev
```

## 3. Backend

- Tecnologia: NestJS + Prisma
- Porta padrao: `5000`
- Responsabilidade:
- API principal
  - orchestracao dos modulos core
  - queue workers
  - integracoes (ReceitaWS, servicos Python)

Variaveis chave:

- `DATABASE_URL`
- `IA_SERVICE_URL`
- `PDF_EXTRACTOR_URL`
- `FILE_HUB_URL`
- `IMPORT_SERVICE_URL`
- `NOTIFICATION_SERVICE_URL`

Startup:

```bash
cd backend
npm run start:dev
```

Compatibilidade de rotas:

- backend expoe ` /imports/* ` como bridge para o `import-service`,
- mantendo o frontend atual funcional durante a migracao progressiva.
- `GET /imports/file-jobs/:id/trace` permanece no backend e consulta o `file-hub`.
- uploads legados suportados no backend bridge:
  - `POST /imports/empresas-cnpj`
  - `POST /imports/upload-contacts`
  - `POST /imports/upload-collaborators`
  - `POST /imports/upload-projects`

Centralizacao de integracoes externas:

- modulo unico `backend/src/integrations` concentra clientes HTTP para:
  - `import-service`
  - `file-hub`
  - `receita-ws`
  - `notification-service`
- estrutura organizada por subdiretorios em `integrations/<service>/client.ts`.

## 4. Valkey (Redis)

- Imagem: `valkey/valkey:latest`
- Porta: `6379`
- Responsabilidade:
  - backend de filas BullMQ

Filas principais:

- `import-cnpjs`
- `formpd-deterministic`
- `formpd-extraction`

## 5. pdf-extractor

- Tecnologia: FastAPI
- Porta: `8010`
- Endpoint de health: `GET /health`
- Endpoint principal: `POST /extract`

Responsabilidade:

- extracao deterministica de PDF FORMPD,
- parser estruturado sem IA,
- sinalizacao de campos faltantes para IA complementar.

Variavel chave:

- `PDF_EXTRACTOR_DB_URL`

Startup local:

```bash
cd services/pdf-extractor
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```

## 6. ai-service

- Tecnologia: FastAPI
- Porta: `8020`
- Endpoint de health: `GET /health`
- Endpoint principal: `POST /execute`

Responsabilidade:

- executar tarefas IA via provider,
- retornar JSON estruturado com latencia e tokens,
- manter backend desacoplado da implementacao de provider.

Variavel chave:

- `ANTHROPIC_API_KEY`

Startup local:

```bash
cd services/ai-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8020
```

## 7. Docker Compose

Arquivo: `docker-compose.yml`

Servicos definidos:

- `valkey`
- `pdf-extractor`
- `ai-service`
- `file-hub`
- `import-service`
- `notification-service`

## 7.2 import-service

- Tecnologia: Node + Express + multer + xlsx + mysql2
- Porta: `8040`
- Endpoint de health: `GET /health`
- Responsabilidade:
  - importacao de Excel/CSV multi-template
  - parser por mapeamento de colunas (`column_map`)
  - persistencia de batches/rows/events em banco dedicado

Variaveis chave:

- `IMPORT_SERVICE_DATABASE_URL`
- `IMPORT_UPLOAD_ROOT`

Endpoints principais:

- `GET /templates`
- `POST /templates`
- `POST /imports/upload?templateCode=...`
- `GET /imports/batches`
- `GET /imports/batches/:id`
- `GET /imports/batches/:id/rows`
- `POST /imports/batches/:id/reprocess`
- `DELETE /imports/batches/:id`
- `GET /imports/batches/:id/trace`

## 7.3 notification-service

- Tecnologia: Node + Express + Socket.IO
- Porta: `8050`
- Endpoint de health: `GET /health`
- Endpoint de ingestao: `POST /events`
- Responsabilidade:
  - concentrar emissao de eventos em tempo real para frontend
  - receber eventos do backend e republicar via Socket.IO

Variaveis chave:

- `NOTIFICATION_SERVICE_PORT`
- `NOTIFICATION_CORS_ORIGIN`

## 7.1 file-hub

- Tecnologia: Node + Express + mysql2
- Porta: `8030`
- Endpoint de health: `GET /health`
- Responsabilidade:
  - registro de `files`, `file_intakes`, `file_jobs`, `file_events`, `file_artifacts`
  - deduplicacao por hash
  - controle seguro de diretorios/fileserver dentro de `FILESERVER_ROOT`

Variaveis chave:

- `FILE_HUB_DATABASE_URL`
- `FILESERVER_ROOT`

Endpoints de filesystem:

- `POST /fs/directories/ensure`
- `GET /fs/directories/list`
- `POST /fs/files/move`

Endpoints de trace/lookup:

- `GET /files/:id`
- `GET /intakes/latest`
- `GET /jobs/latest`
- `GET /trace/files/:fileId`
- `GET /trace/file-jobs/:fileJobId`

Comandos:

```bash
docker compose up -d

docker compose ps
```

## 8. Fluxos entre servicos

### 8.1 Upload FORMPD

1. Frontend envia arquivos tabulares para `import-service`.
2. `import-service` resolve template e parseia linhas.
3. `import-service` grava lote/linhas/eventos no banco `new_tax_imports`.
4. Para FORMPD/PDF, backend continua orquestrando `file-hub` + `pdf-extractor` + `ai-service`.
5. Upload FORMP&D IA via modal esta temporariamente desativado na UI.

### 8.2 Observabilidade

- fila: Queue Admin (`/queue-admin/...`)
- trace de lote/job: `/imports/batches/:id/trace` e `/imports/file-jobs/:id/trace`
  - backend resolve esses traces consultando o `file-hub` via HTTP (sem acesso Prisma direto a `file_*`)
- health checks dos servicos Python em `/health`
- frontend conecta socket no `notification-service` (`VITE_NOTIFICATION_BASE_URL`)

## 9. Padrao operacional recomendado

- Priorizar deterministico.
- Acionar IA de forma targeted por batch/campo.
- Nunca processar sem rastreabilidade em `file_hub`.
- Monitorar filas ativas antes de novos uploads massivos.
