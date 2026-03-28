import re


def _clean_value(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip(" .;:-")
    return cleaned or None


# ---------------------------------------------------------------------------
# Block extraction
# ---------------------------------------------------------------------------


def _extract_remetente_block_v3(lines: list[str]) -> str | None:
    """
    v3: DADOS DO REMETENTE ... CÓDIGO DE AUTENTICIDADE
    Returns the block text, or None if the marker is absent.
    """
    start = None
    end = None
    for i, raw in enumerate(lines):
        upper = raw.upper()
        if "DADOS DO REMETENTE" in upper:
            start = i + 1
            continue
        if start is not None:
            if "CODIGO DE AUTENTICIDADE" in upper:
                end = i + 1  # include the authenticity line
                break
            if "FORMULARIO DO ANO DE REFERENCIA" in upper:
                end = i
                break
    if start is None:
        return None
    if end is None:
        end = min(len(lines), start + 30)
    return "\n".join(lines[start:end])


def _extract_recibo_block_v2(lines: list[str]) -> str | None:
    """
    v2 fallback: RECIBO DE ENTREGA ... (inline fields on subsequent lines).
    Returns the next 20 lines after the RECIBO header, or None if absent.
    """
    for i, raw in enumerate(lines):
        if "RECIBO DE ENTREGA" in raw.upper():
            end = min(len(lines), i + 1 + 20)
            return "\n".join(lines[i + 1 : end])
    return None


def _get_receipt_block(text: str) -> str:
    """
    Return the best available receipt/remetente block for any form version.
    Priority: v3 DADOS DO REMETENTE > v2 RECIBO DE ENTREGA > empty string.
    """
    lines = text.splitlines()
    block = _extract_remetente_block_v3(lines)
    if block is not None:
        return block
    block = _extract_recibo_block_v2(lines)
    if block is not None:
        return block
    return ""


# ---------------------------------------------------------------------------
# Field extraction — handles both inline and multiline label/value patterns
# ---------------------------------------------------------------------------


def _scan_label(block: str, label_regex: str) -> str | None:
    """
    Locate a label in `block` and return its value.
    Handles two layouts:
      • Inline:    "NOME: João Silva"  → captures "João Silva" from the same line.
      • Multiline: "NOME:"             → captures the next non-empty line.
    """
    lines = block.splitlines()
    for i, ln in enumerate(lines):
        m = re.search(label_regex, ln, re.IGNORECASE)
        if not m:
            continue
        # Value on the same line (after the label match)
        after = ln[m.end():].strip(" :-")
        if after:
            return _clean_value(after)
        # Value on the next non-empty line (v3 multiline layout)
        for j in range(i + 1, min(i + 3, len(lines))):
            nxt = lines[j].strip()
            if nxt:
                return _clean_value(nxt)
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def parse_submission_receipt(text: str) -> dict:
    """
    Extract FORMPD submission receipt fields.

    Supports:
    - v3 (2023+): DADOS DO REMETENTE block with multiline label→value pairs.
    - v2 (2019–2022): RECIBO DE ENTREGA block with inline "Nome: [val]" pairs.
    - v1 (2017–2018): No receipt block — returns all None (expected).
    """
    block = _get_receipt_block(text)
    if not block.strip():
        return {
            "sender_name": None,
            "sender_cpf": None,
            "expedition_at": None,
            "authenticity_code": None,
        }

    sender_name = _scan_label(block, r"NOME\s*[:\-]")
    sender_cpf_raw = _scan_label(block, r"CPF\s*[:\-]")
    sender_cpf = re.sub(r"\D", "", sender_cpf_raw or "") or None

    expedition_at = _scan_label(
        block,
        r"EXPEDI\w*\s*[:\-]",
    )
    # Validate expedition_at looks like a date (keep only if it contains digits/slashes)
    if expedition_at and not re.search(r"\d{2}/\d{2}/\d{4}", expedition_at):
        expedition_at = None

    authenticity_code = _scan_label(block, r"C[OÓ]DIGO\s+DE\s+AUTENTICIDADE\s*[:\-]")

    return {
        "sender_name": sender_name,
        "sender_cpf": sender_cpf,
        "expedition_at": expedition_at,
        "authenticity_code": authenticity_code,
    }
