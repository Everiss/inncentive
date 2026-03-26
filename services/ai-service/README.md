# AI Service Microservice

Microservico Python para executar tarefas de IA com providers externos.

## Rodar local

```bash
cd services/ai-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8020
```

## Endpoints

- `GET /health`
- `POST /execute`

## Estrategia

1. O backend resolve configuracao de tarefa (provider/model/prompt) no banco.
2. O backend envia payload normalizado para este servico em `/execute`.
3. Este servico executa no provider e retorna JSON estruturado + tokens + latencia.
