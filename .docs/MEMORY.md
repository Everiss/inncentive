# InnCentive - Memoria Tecnica

Guia de documentacao: [README_DOCS.md](./README_DOCS.md)
Ultima atualizacao: 2026-03-27

## 1. Decisoes tecnicas vigentes

### DT-01 - Extracao FORMPD em duas etapas

Decisao:
- Primeiro extracao deterministica (baixo custo, alta velocidade).
- IA somente para complemento interpretativo.

Impacto:
- Reducao de custo por arquivo.
- Mais previsibilidade operacional.

### DT-02 - IA manual/targeted por batch

Decisao:
- IA passa a ser acionada manualmente por endpoint de enqueue.

Implementacao:
- `POST /imports/formpd/batches/:id/enqueue-ai`

Impacto:
- Controle fino de custo.
- Melhor auditabilidade da decisao de usar IA.

### DT-03 - Separacao fisica de bancos

Decisao:
- `new_tax_db` para core.
- `new_tax_ia` para modulo IA.
- `new_tax_extractor` para extractor.

Impacto:
- Menor superficie de risco.
- Melhor governanca e trilha de auditoria.

### DT-04 - Usuarios por schema com privilegio minimo

Decisao:
- Usuario dedicado por banco (`new_tax_app_svc`, `new_tax_ia_svc`, `pdf_extractor_svc`).

Impacto:
- Isolamento de permissao.
- Menor risco de acesso cruzado indevido.

### DT-05 - IA por microservico Python (opcional por modo)

Decisao:
- Execucao de IA foi centralizada no `ai-service`; backend nao mantém mais engine IA embutida.

Impacto:
- Evolucao independente do motor IA.
- Facilita tuning de provider sem acoplar ao Nest.

### DT-06 - Integracoes externas centralizadas

Decisao:
- Clientes de servicos externos foram centralizados em `backend/src/integrations`.
- Estrutura por servico (`integrations/<service>/client.ts`).

Impacto:
- Menor acoplamento entre modulos de dominio.
- Padronizacao de chamadas HTTP e tratamento de erro.

### DT-07 - Queue Admin incorporado ao modulo Imports

Decisao:
- Endpoints `/queue-admin/*` permanecem os mesmos, mas passaram a ser mantidos dentro do modulo `imports`.

Impacto:
- Reducao de fragmentacao de modulos no backend.
- Manutencao concentrada do dominio de importacao/processamento.

### DT-08 - Despesas FORMPD por nos folha (hierarquia)

Decisao:
- Em `ITENS DE DISPENDIO`, o parser deve respeitar a hierarquia por indentacao.
- Apenas nos folha com valor > 0 sao persistidos em `projects[].expenses`.
- Nivel pai (agregador) nao e persistido como despesa final.

Impacto:
- Elimina dupla contagem de despesas no card de revisao e na aprovacao.
- Mantem coerencia com layout oficial do FORMPD (soma dos niveis inferiores).

## 2. Bugs e aprendizados relevantes

### BUG-01 - Erro `pdfParse is not a function`

Causa:
- Inconsistencia de import/uso da lib de parse PDF no worker Node.

Correcao:
- Fluxo priorizado para `pdf-extractor` dedicado e fallback deterministico controlado.

### BUG-02 - Lote exibindo "Na fila" mesmo com progresso fechado

Causa:
- Divergencia entre estado visual e estado real de jobs/eventos.

Correcao:
- Reforco de acompanhamento via trace endpoint e Queue Admin.

### BUG-03 - Itens `PENDING` presos

Causa:
- Jobs interrompidos/pausados sem reenfileiramento.

Correcao:
- Operacoes de `requeue-pending` e `retry-failed` via Queue Admin.

### BUG-04 - Despesas duplicadas em FORMPD

Causa:
- Parser considerava simultaneamente linha agregadora e linha filha com mesmo valor.

Correcao:
- Parser de despesas atualizado para manter somente itens folha.
- Dedupe defensivo adicionado na persistencia de `formpd_project_expenses` na aprovacao.
- Script operacional criado para saneamento de base historica:
  - `npm run fix:formpd-expenses -- --batch-id=<id>` (dry-run)
  - `npm run fix:formpd-expenses -- --batch-id=<id> --apply`

## 3. Debitos tecnicos abertos

- Padronizar timeline em tempo real com `/trace` no frontend.
- Expandir parse deterministico para mais layouts de PDF.
- Testes automatizados para fila e workflows de importacao.
- Hardening de auth/authorization para operacoes administrativas.

## 4. Proximos passos sugeridos

1. Implementar painel visual completo da timeline de trace no frontend.
2. Adicionar metricas de custo por lote (deterministico vs IA).
3. Formalizar politicas de retry por tipo de erro de fila.
4. Cobrir fluxo de aprovacao FORMPD com testes de integracao.
