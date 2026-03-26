# File Hub Microservice

Microservico Node para controle de metadados de arquivos, intake, jobs, eventos, artefatos e operacoes seguras de diretorios/fileserver.

## Rodar local

```bash
cd services/file-hub
npm install
npm run dev
```

## Variaveis

- `FILE_HUB_PORT` (default `8030`)
- `FILE_HUB_DATABASE_URL` (banco dedicado `new_tax_fileserver`)
- `FILESERVER_ROOT` (raiz segura para operacoes de diretorio/arquivo)

## Endpoints

- `GET /health`
- `POST /hash`
- `POST /intakes/register-upload`
- `POST /jobs/create-processing`
- `POST /jobs/:id/start`
- `POST /jobs/:id/progress`
- `POST /jobs/:id/complete`
- `POST /jobs/:id/fail`
- `POST /artifacts/upsert`

### Fileserver control

- `POST /fs/directories/ensure`
- `GET /fs/directories/list`
- `POST /fs/files/move`

Todas as operacoes de filesystem sao limitadas a `FILESERVER_ROOT` para bloquear path traversal.
