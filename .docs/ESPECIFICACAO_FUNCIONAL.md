# InnCentive - Especificacao Funcional

Guia de documentacao: [README_DOCS.md](./README_DOCS.md)
Ultima atualizacao: 2026-03-26
Versao: 3.0

## 1. Objetivo do sistema

Plataforma SaaS para gestao de incentivos fiscais da Lei do Bem, com foco em:

- consolidacao de dados de empresa, RH, projetos e despesas,
- rastreabilidade de importacoes,
- preenchimento e aprovacao de FORMPD,
- uso de IA de forma controlada e auditavel.

## 2. Fluxo funcional - FORMPD (menu Forms)

### 2.1 Upload via modal

1. Usuario abre menu `Forms`.
2. Envia arquivo PDF no modal de importacao.
3. No estado atual, o upload FORMP&D IA via modal esta temporariamente desativado na interface, aguardando reativacao do fluxo dedicado.
4. Sistema cria lote e rastreabilidade (`batch`, `intake`, `job`, `eventos`).
5. Etapa deterministica extrai dados estruturados sem IA.

### 2.2 Resultado da etapa deterministica

- `PENDING_REVIEW`: pronto para revisao.
- `COMPANY_NOT_FOUND`: CNPJ encontrado, empresa nao cadastrada.
- `CNPJ_MISMATCH`: divergencia entre CNPJ do contexto e CNPJ do PDF.
- `NEEDS_AI_EXTRACTION`: faltam campos para interpretacao.

### 2.3 IA sob demanda

- IA nao deve ser obrigatoria por padrao.
- Usuario/operacao aciona manualmente:
  - `POST /imports/formpd/batches/:id/enqueue-ai`
- Envio para IA deve focar trechos/campos especificos para reduzir custo.

### 2.4 Revisao e aprovacao

1. Usuario revisa dados extraidos.
2. Aprova lote.
3. Sistema promove para tabelas FORMPD canonicas.

## 3. Regras de negocio consolidadas

- RN-01: Nao aprovar lote com CNPJ invalido/mismatch.
- RN-02: Fluxo prioriza extracao deterministica e IA complementar.
- RN-03: Todo upload deve ter rastreabilidade ponta a ponta.
- RN-04: Reprocessamento deve respeitar idempotencia por arquivo/hash.
- RN-05: Acionamento de IA deve ser auditavel (quem, quando, para quais campos).

## 4. Monitoramento operacional

### 4.1 Tela de Processamentos

A tela deve exibir por lote:

- status atual,
- progresso geral,
- total de itens,
- sucesso/erro,
- acao para abrir itens e trace.

### 4.2 Timeline/trace

Fontes oficiais para acompanhamento detalhado:

- `GET /imports/batches/:id/trace`
- `GET /imports/file-jobs/:id/trace`

Esses endpoints devem alimentar a timeline de intake -> job -> evento -> artefato.

### 4.3 Queue Admin

Operacoes esperadas na interface:

- pausar fila,
- retomar fila,
- pausar job de batch,
- retomar job de batch,
- reenfileirar pendentes,
- reprocessar falhas.

## 5. Modulos funcionais

- M0: Gateway de importacao (lotes, parsing, fila, trace).
- M1: Empresas e dados fiscais.
- M2: Contatos e colaboradores.
- M3: Projetos e evidencias.
- M4/M5: Consolidados de dispentios e apuracao.
- M6: FORMPD oficial e aprovacao.
- M7: Relatorios e entrega (evolucao).

## 6. Criterios de qualidade

- rastreabilidade alta por lote/arquivo/job,
- baixo custo de IA com acionamento seletivo,
- consistencia de estados entre backend e UI,
- possibilidade de retomar processamento sem perda de contexto.
