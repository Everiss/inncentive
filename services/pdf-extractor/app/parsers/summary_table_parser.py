"""
summary_table_parser.py
-----------------------
Extracts the v3 project summary table that appears before the individual
PROGRAMA/ATIVIDADES DE PD&I - N blocks.

Layout example (after PyMuPDF):
  PROGRAMA/ATIVIDADES DE PD&I
  ITEM  NOME DA ATIVIDADE DE PD&I   PALAVRAS-CHAVE   VALOR TOTAL R$
  1     Desenvolvimento de IA        kw1; kw2          R$ 150.000,00
  2     Pesquisa em Biomateriais      kw3               R$ 200.000,00
                                              TOTAL    R$ 350.000,00

Used for cross-validation:
  CV-05: project_count_summary == len(projects extracted)
  CV-06: declared_total == sum(project totals)
"""

import re
import unicodedata


def _strip_accents(value: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", value or "") if unicodedata.category(ch) != "Mn"
    )


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", _strip_accents((value or "").upper())).strip()


def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _extract_money(value: str) -> float | None:
    m = re.search(r"R\$\s*([0-9\.\,]+)", value or "", re.IGNORECASE)
    if not m:
        return None
    raw = m.group(1).replace(".", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


# The summary table header — appears BEFORE individual project blocks
_SUMMARY_HEADER_RE = re.compile(
    r"^PROGRAMA/ATIVIDADES DE PD&I\s*$",
    re.IGNORECASE,
)

# Column header line containing ITEM + NOME + VALOR
_COL_HEADER_RE = re.compile(
    r"\bITEM\b.{0,40}\bNOME\b|\bNOME\b.{0,40}\bITEM\b",
    re.IGNORECASE,
)

# Individual project block — signals end of summary table
_BLOCK_START_RE = re.compile(
    r"^PROGRAMA/ATIVIDADES DE PD&I\s*-\s*\d+",
    re.IGNORECASE,
)

# A data row starts with a small integer (item number)
_DATA_ROW_RE = re.compile(r"^\s*(\d{1,3})\s+(.+)")

# Total line
_TOTAL_RE = re.compile(r"\bTOTAL\b", re.IGNORECASE)


def parse_summary_table(text: str) -> dict:
    """
    Extract the project summary table from a v3 FORMPD.

    Returns:
        {
            "found":          bool,
            "project_count":  int,
            "declared_total": float | None,   # sum from TOTAL line
            "rows": [
                {"item": int, "title": str, "total": float | None},
                ...
            ]
        }
    """
    lines = [_clean(ln) for ln in (text or "").splitlines()]

    result: dict = {
        "found": False,
        "project_count": 0,
        "declared_total": None,
        "rows": [],
    }

    # ── Find the summary table block ────────────────────────────────────────
    # The summary header is "PROGRAMA/ATIVIDADES DE PD&I" (without "- N")
    # and appears before the individual blocks.
    in_summary = False
    in_data = False
    rows: list[dict] = []
    declared_total: float | None = None

    for ln in lines:
        if not ln:
            continue

        clean_norm = _norm(ln)

        # End: first individual block starts
        if _BLOCK_START_RE.match(ln):
            break

        # Enter summary header
        if _SUMMARY_HEADER_RE.match(ln):
            in_summary = True
            continue

        if not in_summary:
            continue

        # Column header line — next lines are data rows
        if _COL_HEADER_RE.search(ln):
            in_data = True
            continue

        if not in_data:
            continue

        # Total line
        if _TOTAL_RE.search(clean_norm):
            amount = _extract_money(ln)
            if amount is not None:
                declared_total = amount
            continue

        # Data row: starts with item number
        dm = _DATA_ROW_RE.match(ln)
        if dm:
            item_num = int(dm.group(1))
            rest = dm.group(2).strip()
            # Extract amount from rest (rightmost R$ value)
            amount = _extract_money(rest)
            # Remove amount from rest to get title
            title = re.sub(r"R\$\s*[0-9\.\,]+", "", rest, flags=re.IGNORECASE)
            # Remove keywords if separated by known delimiter patterns
            title = re.sub(r"\s*[;|]\s*[\w\s;,]+$", "", title).strip(" ,-;")
            rows.append({"item": item_num, "title": title[:500] or None, "total": amount})
            continue

    if rows or declared_total is not None:
        result["found"] = True
        result["rows"] = rows
        result["project_count"] = len(rows)
        result["declared_total"] = declared_total

    return result
