# PDF Extractor Microservice

Microservico Python para extracao deterministica de FORMP&D sem IA.

## Rodar local

```bash
cd services/pdf-extractor
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```

## Endpoints

- `GET /health`
- `POST /extract` (multipart file PDF)

## Estrategia

1. Extracao de texto com PyMuPDF e pdfplumber.
2. Parsing deterministico por secoes (empresa, projetos, RH, despesas).
3. Saida com `confidence`, `missing_fields` e `needs_ai` para acionamento manual de IA.
