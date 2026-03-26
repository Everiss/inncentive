import re
from app.extractors.normalize import normalize_cnpj


def parse_company(text: str) -> dict:
    # Accept both masked and unmasked CNPJ.
    cnpj_match = re.search(r"\b(?:\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}|\d{14})\b", text)

    legal_name = None

    # Same-line pattern.
    legal_name_match = re.search(r"RAZ\S*O\s+SOCIAL\s*[:\-]?\s*(.+)", text, re.IGNORECASE)
    if legal_name_match:
        candidate = legal_name_match.group(1).strip()
        if candidate and "CNPJ" not in candidate.upper():
            legal_name = candidate

    # Fallback: value in next non-empty line(s).
    if not legal_name:
        lines = [ln.strip() for ln in text.splitlines()]
        for i, line in enumerate(lines):
            if re.search(r"RAZ\S*O\s+SOCIAL", line, re.IGNORECASE):
                for nxt in lines[i + 1 : i + 8]:
                    if not nxt:
                        continue
                    upper = nxt.upper()
                    if "CNPJ" in upper or "DADOS DO REMETENTE" in upper or "ANO BASE" in upper:
                        break
                    legal_name = nxt
                    break
                if legal_name:
                    break

    return {
        "cnpj": normalize_cnpj(cnpj_match.group(0) if cnpj_match else None),
        "legal_name": legal_name,
    }
