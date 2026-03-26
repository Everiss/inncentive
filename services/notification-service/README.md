# notification-service

Microservico central de notificacoes em tempo real.

## Endpoints

- `GET /health`
- `POST /events` com payload:
  - `eventName: string`
  - `payload: any`

## Socket.IO

Clientes conectam via Socket.IO e recebem eventos emitidos em `/events`.

Padrao:

- backend publica evento HTTP em `/events`
- service reemite no canal `eventName`

## Executar local

```bash
npm install
npm run dev
```

