# README_DOCS - Mapa de Documentacao

Ultima atualizacao: 2026-03-26
Escopo: padronizar manutencao da documentacao tecnica em `.docs/`.

## Arquivos da pasta .docs

- `ESPECIFICACAO_FUNCIONAL.md`
  - Regras de negocio, fluxos funcionais, estados e aprovacoes.
- `ARQUITETURA.md`
  - Topologia tecnica, modulos, filas, endpoints e variaveis de ambiente.
- `DATABASE.md`
  - Estrategia de dados, bancos, schemas, tabelas-chave e convencoes.
- `SERVICES.md`
  - Catalogo de servicos (backend, frontend, ai-service, pdf-extractor, valkey).
- `MEMORY.md`
  - Decisoes tecnicas, bugs relevantes, debitos e roadmap.

## Fonte da verdade por tema

- "Como o sistema funciona" -> `ESPECIFICACAO_FUNCIONAL.md`
- "Como o sistema esta montado" -> `ARQUITETURA.md`
- "Onde e como os dados estao" -> `DATABASE.md`
- "Como operar servicos" -> `SERVICES.md`
- "Por que decisoes foram tomadas" -> `MEMORY.md`

## Quando atualizar cada arquivo

- `ESPECIFICACAO_FUNCIONAL.md`
  - Mudou fluxo de usuario, regra de aprovacao ou status de processo.
- `ARQUITETURA.md`
  - Mudou endpoint, fila, worker, microservico, provider ou topologia.
- `DATABASE.md`
  - Mudou tabela, coluna, enum, indice, FK, estrategia de banco ou usuario.
- `SERVICES.md`
  - Mudou porta, healthcheck, variavel de ambiente, compose, startup.
- `MEMORY.md`
  - Nova decisao tecnica, bug relevante, tradeoff, debito ou risco.

## Checklist obrigatorio

1. Codigo alterado e validado.
2. Se mudou banco: atualizar `DATABASE.md`.
3. Se mudou fluxo/regra: atualizar `ESPECIFICACAO_FUNCIONAL.md`.
4. Se mudou servico/fila/endpoints: atualizar `ARQUITETURA.md` e `SERVICES.md`.
5. Se houve decisao/bug importante: registrar em `MEMORY.md`.
6. Confirmar consistencia entre nomes em codigo e docs.
7. Atualizar data de revisao no arquivo alterado.

## Convencoes

- Manter nomes tecnicos exatamente como no codigo.
- Evitar duplicar regra em dois arquivos com conflito.
- Preferir UTF-8.
- Citar endpoint/tabela/fila com path/nome literal.
