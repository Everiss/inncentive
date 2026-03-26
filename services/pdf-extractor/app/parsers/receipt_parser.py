import re


def _clean_value(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip(" .;:-")
    return cleaned or None


def _extract_remetente_block(text: str) -> str:
    lines = text.splitlines()
    start = None
    end = None

    for i, raw in enumerate(lines):
        upper = raw.upper()
        if "DADOS DO REMETENTE" in upper:
            start = i + 1
            continue
        if start is not None:
            if "CODIGO DE AUTENTICIDADE" in upper:
                end = i + 1
                break
            if "FORMULARIO DO ANO DE REFERENCIA" in upper:
                end = i
                break

    # Old layouts (e.g. 2018) may not have the "DADOS DO REMETENTE" block.
    # In this case return empty block to avoid false positives from project titles.
    if start is None:
        return ""
    if end is None:
        end = min(len(lines), start + 30)
    return "\n".join(lines[start:end])


def _extract_label_value(block: str, label_regex: str) -> str | None:
    m = re.search(label_regex, block, re.IGNORECASE)
    if not m:
        return None
    return _clean_value(m.group(1))


def parse_submission_receipt(text: str) -> dict:
    remetente_block = _extract_remetente_block(text)
    if not remetente_block.strip():
        return {
            "sender_name": None,
            "sender_cpf": None,
            "expedition_at": None,
            "authenticity_code": None,
        }

    sender_name = _extract_label_value(remetente_block, r"(?mi)^\s*NOME\s*[:\-]\s*(.+)$")
    sender_cpf_raw = _extract_label_value(remetente_block, r"(?mi)^\s*CPF\s*[:\-]\s*([0-9.\-]{11,14})")
    sender_cpf = re.sub(r"\D", "", sender_cpf_raw or "") or None
    expedition_at = _extract_label_value(
        remetente_block,
        r"(?mi)^\s*EXPEDI\w*\s*[:\-]\s*([0-3]?\d/[0-1]?\d/20\d{2}\s*(?:-\s*)?[0-2]?\d:[0-5]\d(?::[0-5]\d)?)",
    )
    authenticity_code = _extract_label_value(
        remetente_block,
        r"(?mi)^\s*C[OÓ]DIGO\s+DE\s+AUTENTICIDADE\s*[:\-]\s*([A-Za-z0-9\-]+)",
    )

    return {
        "sender_name": sender_name,
        "sender_cpf": sender_cpf,
        "expedition_at": expedition_at,
        "authenticity_code": authenticity_code,
    }
