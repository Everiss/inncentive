"""
texts.py
--------
Minimal representative text fixtures for each FORMPD version.
These mimic what PyMuPDF / pdfplumber would extract from real PDFs,
including the exact field format each parser expects.
"""

# ---------------------------------------------------------------------------
# v1_2017 — legacy, radio buttons only (no DADOS PESSOA JURIDICA header),
#            v1 HR format: "ITEM N" + space-separated keys
# ---------------------------------------------------------------------------

V1_2017 = """\
CNPJ: 11.222.333/0001-81
RAZÃO SOCIAL: EMPRESA TESTE LTDA
ANO BASE: 2017

3.1.1. PROJETOS/ATIVIDADES DE PD&I
3.1.1.1. TÍTULO DO PROJETO:
Desenvolvimento de novo polímero biodegradável
3.1.1.2. CATEGORIA DO PROJETO
( O ) Pesquisa Básica
( ) Pesquisa Aplicada
( ) Desenvolvimento Experimental

3.1.1.1.1. RECURSOS HUMANOS
ITEM 1
NOME João da Silva
CPF 12345678909
TITULACAO Mestre
TOTAL HORAS ANUAIS 1200
VALOR (R$ ANUAL) 45.000,00
"""

# ---------------------------------------------------------------------------
# v1_2018 — legacy + DADOS PESSOA JURIDICA + ELEMENTO INOVADOR
# ---------------------------------------------------------------------------

V1_2018 = """\
DADOS PESSOA JURIDICA
RAZÃO SOCIAL: INOVAÇÃO INDUSTRIAL S.A.
CNPJ: 11.222.333/0001-81
ANO BASE: 2018

3.1.1. PROJETOS/ATIVIDADES DE PD&I
3.1.1.1. TÍTULO DO PROJETO:
Otimização de processo de fundição
3.1.1.2. CATEGORIA DO PROJETO
( O ) Desenvolvimento Experimental
( ) Pesquisa Básica
3.1.1.3. ELEMENTO INOVADOR:
Redução de resíduos em 40% mediante novo catalisador

3.1.1.1.1. RECURSOS HUMANOS
ITEM 1
NOME Maria Oliveira
CPF 98765432100
TITULACAO Doutora
TOTAL HORAS ANUAIS 800
VALOR (R$ ANUAL) 38.000,00
"""

# ---------------------------------------------------------------------------
# v2_early — 2019-2021, RECIBO DE ENTREGA inline, no [Item N] markers
#             v2 HR format: RELAÇÃO DE RECURSOS HUMANOS + ITEM N
# ---------------------------------------------------------------------------

V2_EARLY = """\
RECIBO DE ENTREGA
Nome: Carlos Pereira
CPF: 111.444.777-35
Data de Expedição: 30/06/2020
Código de Autenticidade: 12345678901234567890123

RAZÃO SOCIAL: TECNOLOGIA AVANÇADA LTDA
CNPJ: 11.222.333/0001-81
ANO BASE: 2020

3.1.1. PROJETOS/ATIVIDADES DE PD&I
3.1.1.1. TÍTULO DO PROJETO:
Sistema de automação industrial com IA embarcada
3.1.1.2. CATEGORIA DO PROJETO: Desenvolvimento Experimental
3.1.1.3. ELEMENTO INOVADOR: Algoritmo proprietário de detecção de anomalias

3.1.1.1.1. RELAÇÃO DE RECURSOS HUMANOS
ITEM 1
NOME Ana Lima
CPF 22233344455
TITULACAO Especialista
TOTAL HORAS ANUAIS 1600
VALOR (R$ ANUAL) 80.000,00
"""

# ---------------------------------------------------------------------------
# v2_late — 2022, RECIBO DE ENTREGA + [Item N] multi-project markers
# ---------------------------------------------------------------------------

V2_LATE = """\
RECIBO DE ENTREGA
Nome: Fernanda Costa
CPF: 444.555.666-77
Data de Expedição: 15/07/2022
Código de Autenticidade: 98765432109876543210987

RAZÃO SOCIAL: GRUPO INDÚSTRIA BRASIL S.A.
CNPJ: 11.222.333/0001-81
ANO BASE: 2022

[ITEM 1]
3.1.1. PROJETOS/ATIVIDADES DE PD&I
3.1.1.1. TÍTULO DO PROJETO: Desenvolvimento de bateria de sódio-íon
3.1.1.2. CATEGORIA DO PROJETO: Pesquisa Aplicada
3.1.1.3. RESULTADO ECONÔMICO OBTIDO NO ANO-BASE: Redução de custo em 15%

[ITEM 1]
3.1.1.1.1. RELAÇÃO DE RECURSOS HUMANOS
ITEM 1
NOME Roberto Matos
CPF 55566677788
TITULACAO Mestre
TOTAL HORAS ANUAIS 2000
VALOR (R$ ANUAL) 120.000,00

[ITEM 1]
3.1.1.1.2. ITENS DE DISPÊNDIO
3.1.1.1.2.1. SERVIÇOS DE TERCEIROS
CNPJ/CPF: 22.333.444/0001-55
Nome: LAB ANÁLISES LTDA
Valor Total: R$ 30.000,00
Situação: APROVADO
"""

# ---------------------------------------------------------------------------
# v3_early — 2023, DADOS DO REMETENTE + UUID auth, PROGRAMA/ATIVIDADES - N
# ---------------------------------------------------------------------------

V3_EARLY = """\
DADOS DA EMPRESA
RAZÃO SOCIAL: STARTUP VERDE LTDA
CNPJ: 11.222.333/0001-81
ANO BASE: 2023

DADOS DO REMETENTE
NOME:
Paulo Rodrigues
CPF:
333.222.111-99
DATA DE EXPEDIÇÃO:
20/03/2024
CÓDIGO DE AUTENTICIDADE:
A1B2C3D4-E5F6-7890-ABCD-EF1234567890

PROGRAMA/ATIVIDADES DE PD&I
ITEM  NOME DA ATIVIDADE DE PD&I                       VALOR TOTAL R$
1     Plataforma de monitoramento ambiental            R$ 250.000,00
                                             TOTAL    R$ 250.000,00

PROGRAMA/ATIVIDADES DE PD&I - 1
TÍTULO DO PROJETO: Plataforma de monitoramento ambiental
CATEGORIA: DESENVOLVIMENTO_EXPERIMENTAL
METODOLOGIA: Desenvolvimento iterativo com sprints quinzenais

RELAÇÃO DE RECURSOS HUMANOS
CPF             NOME                    QUALIFICAÇÃO         H.ANUAIS  DEDICAÇÃO  VALOR ANUAL
333.222.111-99  Paulo Rodrigues         Doutor               1800      EXCLUSIVA  R$ 95.000,00
444.333.222-11  Júlia Santos            Mestre               1400      PARCIAL    R$ 58.000,00
"""

# ---------------------------------------------------------------------------
# v3_late — 2024+, RECEITA OPERACIONAL BRUTA, TRL justification, MRL scale
#            Summary table uses ITEM/TITULO DO PROJETO (not NOME DA ATIVIDADE)
# ---------------------------------------------------------------------------

V3_LATE = """\
DADOS DA EMPRESA
RAZÃO SOCIAL: INOVAÇÃO DEEP TECH S.A.
CNPJ: 11.222.333/0001-81
ANO BASE: 2024
RECEITA OPERACIONAL BRUTA: R$ 15.000.000,00
QUAL É O TIPO DE EMPRESA: Empresa de Grande Porte

DADOS DO REMETENTE
NOME:
Luciana Ferreira
CPF:
777.888.999-00
DATA DE EXPEDIÇÃO:
10/01/2025
CÓDIGO DE AUTENTICIDADE:
F9E8D7C6-B5A4-3210-FEDC-BA9876543210

PROGRAMA/ATIVIDADES DE PD&I
ITEM  NOME DA ATIVIDADE DE PD&I                    VALOR TOTAL R$
1     Motor de IA para diagnóstico médico           R$ 400.000,00
                                          TOTAL    R$ 400.000,00

PROGRAMA/ATIVIDADES DE PD&I - 1
ITEM/TITULO DO PROJETO DE PD&I: Motor de IA para diagnóstico médico
CATEGORIA: PESQUISA_APLICADA
METODOLOGIA: Design Science Research com prototipagem rápida
TRL INICIAL: 3
TRL FINAL: 6
JUSTIFIQUE O GRAU DE MATURIDADE TECNOLÓGICA:
O projeto parte de princípios validados em laboratório (TRL 3)
MRL 3 — Conceito de manufatura demonstrado
TRL_JUSTIFICATION: Evolução de TRL 3 para TRL 6 demonstrada em protótipo funcional

RELAÇÃO DE RECURSOS HUMANOS
CPF             NOME                  QUALIFICAÇÃO   H.ANUAIS  DEDICAÇÃO  VALOR ANUAL
777.888.999-00  Luciana Ferreira      Doutora        2000      EXCLUSIVA  R$ 130.000,00
888.777.666-55  André Moraes          Especialista   1200      PARCIAL    R$ 62.000,00
"""
