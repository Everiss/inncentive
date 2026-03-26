import re
from datetime import datetime


def only_digits(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def normalize_cnpj(value: str | None) -> str | None:
    digits = only_digits(value)
    if not digits:
        return None
    return digits.zfill(14)


def parse_fiscal_year(text: str) -> int | None:
    m = re.search(r"(?:ANO\s*BASE|Ano-?calendario)\s*[:\-]?\s*(20\d{2})", text, re.IGNORECASE)
    if m:
        return int(m.group(1))

    years = [int(y) for y in re.findall(r"\b20\d{2}\b", text)]
    if years:
        now = datetime.now().year
        valid = [y for y in years if 2005 <= y <= now + 1]
        if valid:
            return max(valid)
    return None
