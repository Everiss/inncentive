# InnCentive - Arquitetura Tecnica

Guia de documentacao: [README_DOCS.md](./README_DOCS.md)
Ultima atualizacao: 2026-03-26
Versao: 3.0

## 1. Topologia atual

```text
Browser (React/Vite)
  -> notification-service (:8050) [Socket.IO realtime]
  -> NestJS API (:5000)
      -> MySQL new_tax_db (core da aplicacao)
      -> Valkey/Redis (:6379) para BullMQ
      -> import-service (:8040)
      -> file-hub (:8030)
      -> ai-service (:8020) [execucao de IA centralizada]
      -> pdf-extractor (:8010) para extracao deterministica de PDF
      -> notification-service (:8050) [publicacao de eventos]
      -> ReceitaWS API (cadastro CNPJ)
```

## 2. Monorepo

```text
new-tax/
  .docs/
  backend/                 # NestJS + Prisma
  frontend/                # React + Vite
  services/
    ai-service/            # FastAPI (execucao de provider IA)
    notification-service/  # Node + Socket.IO (eventos realtime)
    pdf-extractor/         # FastAPI (extracao deterministica)
  shared/contracts/        # contratos compartilhados
  docker-compose.yml
```

## 3. Modulos backend

- `imports`
  - Uploads, lotes, rastreabilidade, aprovacao e descarte.
  - Inclui tambem os endpoints administrativos de fila (`/queue-admin/*`).
  - Fluxo FORMPD: deterministico -> revisao -> IA manual quando necessario.
- `formpd`
  - Persistencia de formularios/projetos FORMPD e sub-tabelas.
- `file-hub`
  - Registro canonicamente rastreavel de arquivos, intake, jobs e artefatos.
- `integrations`
  - modulo unico de clientes externos.
  - subpastas por servico: `import-service`, `file-hub`, `receita-ws`, `notification-service`.

## 4. Filas BullMQ

- `import-cnpjs`
  - Cadastro de empresa via ReceitaWS.
- `formpd-deterministic`
  - Etapa deterministica (baixo custo) para parse inicial do PDF.
- `formpd-extraction`
  - Etapa de IA (manual/targeted), processando somente campos necessarios.

## 5. Endpoints principais

### imports

- `POST /imports/formpd/batches/:id/register-company`
- `POST /imports/formpd/batches/:id/approve`
- `POST /imports/formpd/batches/:id/discard`
- `POST /imports/formpd/batches/:id/enqueue-ai`
- `GET /imports/formpd/batches/:id/pdf`
- `GET /imports/batches`
- `GET /imports/batches/:id/items`
- `GET /imports/batches/:id/trace`
- `GET /imports/file-jobs/:id/trace`

### queue-admin

- `GET /queue-admin/queues/:name/status`
- `POST /queue-admin/queues/:name/pause`
- `POST /queue-admin/queues/:name/resume`
- `POST /queue-admin/batches/:id/pause-job`
- `POST /queue-admin/batches/:id/resume-job`
- `POST /queue-admin/batches/:id/requeue-pending`
- `POST /queue-admin/batches/:id/retry-failed`

## 6. Arquitetura de dados (alto nivel)

- `new_tax_db`
  - Core do produto (companies, imports, filehub, formpd, rdi, payroll).
- `new_tax_ia`
  - Tabelas IA (`ia_task_configs`, `ia_prompts`, `ia_model_pricing`, `ia_executions`).
- `new_tax_extractor`
  - Telemetria e rastreabilidade de extracao deterministica.

## 7. Variaveis de ambiente chave

### backend

- `DATABASE_URL`
- `IA_SERVICE_URL` (default `http://localhost:8020/execute`)
- `IA_SERVICE_TIMEOUT_MS`
- `PDF_EXTRACTOR_URL` (default `http://localhost:8010/extract`)
- `FILE_HUB_URL` (default `http://localhost:8030`)
- `IMPORT_SERVICE_URL` (default `http://localhost:8040`)
- `NOTIFICATION_SERVICE_URL` (default `http://localhost:8050`)
- `RECEITA_WS_BASE_URL`
- `RECEITA_WS_TOKEN`

### services/ai-service

- `ANTHROPIC_API_KEY`

### services/pdf-extractor

- `PDF_EXTRACTOR_DB_URL`

### services/notification-service

- `NOTIFICATION_SERVICE_PORT`
- `NOTIFICATION_CORS_ORIGIN`

## 8. Fluxo FORMPD via menu Forms

1. Usuario envia PDF no modal de Forms.
2. Backend cria `files`, `file_intakes`, `file_jobs` e `import_batches`.
3. Fila `formpd-deterministic` extrai campos estruturados.
   - No bloco `ITENS DE DISPENDIO`, o parser considera hierarquia por indentacao.
   - Apenas itens folha (menor nivel) com valor > 0 sao persistidos como despesas finais.
4. Batch vai para revisao (`PENDING_REVIEW`) ou pendencia (`COMPANY_NOT_FOUND`, etc.).
5. Se faltar campo critico, batch pode ficar `NEEDS_AI_EXTRACTION`.
6. IA e acionada manualmente por `POST /imports/formpd/batches/:id/enqueue-ai`.
7. Resultado e revisado e aprovado com `POST /imports/formpd/batches/:id/approve`.

## 9. Observacoes operacionais

- O Queue Admin opera filas sem perder rastreabilidade do batch.
- A timeline de acompanhamento deve usar `/imports/batches/:id/trace` e `/imports/file-jobs/:id/trace`.
- Prioridade de custo: parser deterministico primeiro, IA somente para interpretacao direcionada.
- Despesas FORMPD: valores agregados de nivel superior nao devem ser somados novamente na UI/DB.
