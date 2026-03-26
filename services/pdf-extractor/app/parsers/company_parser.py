import re
from app.extractors.normalize import normalize_cnpj


def parse_company(text: str) -> dict:
    cnpj_match = re.search(r"\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b", text)
    legal_name_match = re.search(r"RAZAO\s+SOCIAL\s*[:\-]?\s*(.+)", text, re.IGNORECASE)

    return {
        "cnpj": normalize_cnpj(cnpj_match.group(0) if cnpj_match else None),
        "legal_name": (legal_name_match.group(1).strip() if legal_name_match else None),
    }
