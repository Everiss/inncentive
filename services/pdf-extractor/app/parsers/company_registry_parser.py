import re
import unicodedata


def _strip_accents(value: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", value or "") if unicodedata.category(ch) != "Mn"
    )


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", _strip_accents((value or "").upper())).strip()


def _field_key(label: str) -> str:
    n = _norm(label)
    if "SITUACAO NA RECEITA" in n:
        return "situacao_na_receita"
    if "LOGRADOURO" in n:
        return "logradouro"
    if n == "NUMERO":
        return "numero"
    if "SIGLA" in n:
        return "sigla"
    if "RAZAO SOCIAL" in n:
        return "razao_social"
    if "NATUREZA JURIDICA" in n:
        return "natureza_juridica"
    if "DATA DE FUNDACAO" in n:
        return "data_fundacao"
    if "COMPLEMENTO" in n:
        return "complemento"
    if "TIPO DE ENDERECO" in n:
        return "tipo_endereco"
    if "REPRESENTANTE LEGAL" in n:
        return "representante_legal"
    if "BAIRRO" in n:
        return "bairro"
    if n == "CNAE":
        return "cnae"
    if "MUNICIPIO" in n:
        return "municipio"
    if "COD. POSTAL" in n or "COD POSTAL" in n:
        return "cod_postal"
    if n == "CNPJ":
        return "cnpj"
    if "PORTE DA EMPRESA" in n:
        return "porte_da_empresa"
    return ""


def parse_company_registry(text: str) -> dict:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    start = None
    end = len(lines)
    min_lines_before_end_marker = 8
    for i, ln in enumerate(lines):
        nln = _norm(ln)
        if "DADOS PESSOA JURIDICA" in nln or "DADOS DA EMPRESA" in nln:
            start = i + 1
            continue
        if start is not None and (
            "DADOS DO REMETENTE" in nln
            or "IDENTIFICACAO/CARACTERISTICAS DA EMPRESA" in nln
            or "IDENTIFICACAO CARACTERISTICAS DA EMPRESA" in nln
            or "IDENTIFICACAOCARACTERISTICAS DA EMPRESA" in nln
            or "1. IDENTIFICACAO DA EMPRESA" in nln
            or "1 IDENTIFICACAO DA EMPRESA" in nln
        ):
            # Some PDFs (e.g. 2021) have reading order issues and show
            # "1. IDENTIFICACAO..." before the company registry fields.
            # Ignore premature end markers until we have a minimally sized block.
            if i - start >= min_lines_before_end_marker:
                end = i
                break

    if start is None:
        return {"fields": {}, "raw_text": ""}

    block = lines[start:end]
    fields: dict[str, str] = {}

    # Common formats:
    # 1) "Label: value"
    # 2) "Label:" then next line as value
    for i, ln in enumerate(block):
        m = re.match(r"^\s*([^:]{2,80}):\s*(.*)$", ln)
        if not m:
            continue
        label = m.group(1).strip()
        value = m.group(2).strip()
        if not value and i + 1 < len(block):
            nxt = block[i + 1].strip()
            if ":" not in nxt:
                value = nxt
        key = _field_key(label)
        if key and value:
            fields[key] = value

    return {
        "fields": fields,
        "raw_text": "\n".join(block),
    }
