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
        m = re.search(r"([0-9\.\,]+)$", value or "")
    if not m:
        return None
    raw = m.group(1).replace(".", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def _extract_int(value: str) -> int | None:
    m = re.search(r"([0-9]{1,6})", value or "")
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def _is_numbered_heading(line: str) -> bool:
    return bool(re.match(r"^\d+(?:\.\d+){1,5}\.?\s+", line or ""))


def _new_person(project_idx: int) -> dict:
    return {
        "project_index": project_idx,
        "cpf": None,
        "name": None,
        "role": None,
        "qualification": None,
        "annual_hours": None,
        "dedication_type": None,
        "dedication_pct": None,
        "annual_amount": None,
    }


def _person_has_data(p: dict) -> bool:
    return any(p.get(k) for k in ("name", "cpf", "annual_amount", "annual_hours"))


# ---------------------------------------------------------------------------
# v1 / v2 numbered section parsers
# ---------------------------------------------------------------------------

# v2: "3.1.X.X.X. [Item N] RELAÇÃO DE RECURSOS HUMANOS..."
_V2_SECTION_RE = re.compile(
    r"^3\.1\.\d+\.\d+\.\d+\.\s*(?:\[ITEM\s*(\d+)\]\s*)?RELA[CÇ][AÃ]O DE RECURSOS HUMANOS",
    re.IGNORECASE,
)

# v1: "3.1.X.X.X. [Item N] RECURSOS HUMANOS" (sem "RELAÇÃO DE")
_V1_SECTION_RE = re.compile(
    r"^3\.1\.\d+\.\d+\.\d+\.\s*(?:\[ITEM\s*(\d+)\]\s*)?RECURSOS HUMANOS\b",
    re.IGNORECASE,
)


def _parse_numbered_hr(lines: list[str], section_re: re.Pattern) -> list[dict]:
    """
    Core parser for v1 and v2 numbered HR sections.
    section_re must capture group(1) = Item N (project index) when present.
    """
    results: list[dict] = []
    fallback_project_idx = 1
    i = 0

    while i < len(lines):
        line = lines[i]
        m = section_re.match(line)
        if not m:
            i += 1
            continue

        # Derive project index from [Item N] or fall back to the running counter.
        # For v1, the third-level number in "3.1.X..." is also a valid source.
        item_idx = m.group(1) if m.lastindex and m.group(1) else None
        if item_idx:
            project_idx = int(item_idx)
        else:
            # Try "3.1.X." prefix
            num_m = re.match(r"^3\.1\.(\d+)\.", line)
            project_idx = int(num_m.group(1)) if num_m else fallback_project_idx
        fallback_project_idx = max(fallback_project_idx, project_idx)

        j = i + 1
        current: dict | None = None

        while j < len(lines):
            ln = lines[j]
            n = _norm(ln)

            if _is_numbered_heading(ln):
                if current and _person_has_data(current):
                    results.append(current)
                break

            if "NENHUM REGISTRO ADICIONADO" in n:
                if current and _person_has_data(current):
                    results.append(current)
                current = None
                break

            if re.match(r"^ITEM\s+\d+", n):
                if current and _person_has_data(current):
                    results.append(current)
                current = _new_person(project_idx)
                j += 1
                continue

            if current is None:
                j += 1
                continue

            if n.startswith("CPF "):
                current["cpf"] = re.sub(r"\D", "", ln) or None
            elif n.startswith("NOME "):
                current["name"] = ln.split(" ", 1)[1].strip() if " " in ln else None
            elif n.startswith("TITULACAO "):
                current["qualification"] = ln.split(" ", 1)[1].strip() if " " in ln else None
            elif n.startswith("FUNCAO "):
                current["role"] = ln.split(" ", 1)[1].strip() if " " in ln else None
            elif "TOTAL HORAS" in n:
                current["annual_hours"] = _extract_int(ln)
            elif n.startswith("DEDICACAO "):
                dedication = ln.split(" ", 1)[1].strip() if " " in ln else None
                current["dedication_type"] = dedication
                dnorm = _norm(dedication or "")
                current["dedication_pct"] = 100 if dnorm.startswith("EXCLUSIVA") else None
            elif (
                n.startswith("VALOR (R$")
                or n.startswith("VALOR TOTAL (R$")
                or n.startswith("VALOR R$")
            ):
                current["annual_amount"] = _extract_money(ln)

            j += 1

        if current and _person_has_data(current):
            results.append(current)
        i = j + 1

    return results


# ---------------------------------------------------------------------------
# v3 table parser (PROGRAMA/ATIVIDADES DE PD&I blocks)
# ---------------------------------------------------------------------------

_BLOCK_RE_V3 = re.compile(r"^PROGRAMA/ATIVIDADES DE PD&I\s*-\s*(\d+)", re.IGNORECASE)
_HR_HEADER_RE = re.compile(r"RELA[CÇ][AÃ]O DE RECURSOS HUMANOS", re.IGNORECASE)
_HR_COL_HEADER_RE = re.compile(
    r"\bCPF\b.{0,40}\bNOME\b|\bNOME\b.{0,40}\bCPF\b", re.IGNORECASE
)
_CPF_ROW_RE = re.compile(r"^\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b")
_V3_STOP_RE = re.compile(
    r"ITENS DE DISPEN[DS]IO|EQUIPAMENTOS NACIONAIS|INCENTIVOS FISCAIS|"
    r"FONTES DE FINANCIAMENTO|BENS INTANGIVEIS|PATENTES",
    re.IGNORECASE,
)
_DEDICATION_RE = re.compile(r"\b(EXCLUSIVA|PARCIAL)\b", re.IGNORECASE)
_HOURS_RE = re.compile(r"\b([1-9]\d{2,3})\b")  # 100–9999

# Known qualification keywords used as field boundaries when parsing table rows
_QUAL_RE = re.compile(
    r"\b(DOUTOR(?:ADO)?|MESTRE|MESTRADO|GRADUAD[OA]|GRADUACAO|ESPECIALIZACAO|"
    r"TECNICO|POS.DOUTOR(?:ADO)?|BACHAREL|MBA|LICENCIATURA)\b",
    re.IGNORECASE,
)


def _parse_v3_hr_row(row_text: str, project_idx: int) -> dict | None:
    """Parse one v3 HR table row (may span multiple lines joined by space)."""
    text = _clean(row_text)
    if not text:
        return None

    # Extract CPF
    cpf_m = re.search(r"(\d{3}[.\-]\d{3}[.\-]\d{3}[-]\d{2})", text)
    cpf = re.sub(r"\D", "", cpf_m.group(1)) if cpf_m else None

    # Extract R$ amount
    amount = _extract_money(text)

    # Extract dedication
    ded_m = _DEDICATION_RE.search(_norm(text))
    dedication = ded_m.group(1).upper() if ded_m else None

    # Extract hours — strip CPF and monetary parts first
    stripped = text
    if cpf_m:
        stripped = stripped.replace(cpf_m.group(0), " ", 1)
    stripped = re.sub(r"R\$\s*[0-9.,]+", " ", stripped, flags=re.IGNORECASE)
    stripped = re.sub(r"\b\d{5,}\b", " ", stripped)  # remove long numbers
    hours_m = _HOURS_RE.search(stripped)
    annual_hours = int(hours_m.group(1)) if hours_m else None

    # Build remainder for name/qualification/role extraction
    remainder = text
    if cpf_m:
        remainder = remainder.replace(cpf_m.group(0), " ", 1)
    remainder = re.sub(r"R\$\s*[0-9.,]+", " ", remainder, flags=re.IGNORECASE)
    remainder = re.sub(r"\b(EXCLUSIVA|PARCIAL)\b", " ", remainder, flags=re.IGNORECASE)
    if hours_m:
        remainder = re.sub(r"\b" + re.escape(hours_m.group(1)) + r"\b", " ", remainder, count=1)
    remainder = re.sub(r"\s+", " ", remainder).strip()

    # Split at first qualification keyword: left = name, right = qual + role
    name: str | None = None
    qualification: str | None = None
    role: str | None = None
    qual_m = _QUAL_RE.search(remainder)
    if qual_m:
        name = remainder[: qual_m.start()].strip(" ,;:-") or None
        after_qual = remainder[qual_m.start():].strip()
        qual_word = qual_m.group(0)
        role_part = after_qual[len(qual_word):].strip(" ,;:-")
        qualification = qual_word
        role = role_part or None
    else:
        name = remainder or None

    person = _new_person(project_idx)
    person.update(
        {
            "cpf": cpf,
            "name": name,
            "role": role,
            "qualification": qualification,
            "annual_hours": annual_hours,
            "dedication_type": dedication,
            "dedication_pct": 100 if dedication == "EXCLUSIVA" else None,
            "annual_amount": amount,
        }
    )
    return person if _person_has_data(person) else None


def _parse_hr_v3_table(text: str) -> list[dict]:
    """
    Parse HR records from v3 FORMPD.
    HR appears as a table inside each PROGRAMA/ATIVIDADES DE PD&I - N block.
    PyMuPDF may produce rows as single lines (CPF ... VALOR) or split across lines.
    """
    lines = [_clean(ln) for ln in text.splitlines()]
    results: list[dict] = []
    current_project = 1
    in_hr = False
    current_row_lines: list[str] = []

    def flush_row() -> None:
        if not current_row_lines:
            return
        row_text = " ".join(current_row_lines)
        current_row_lines.clear()
        person = _parse_v3_hr_row(row_text, current_project)
        if person:
            results.append(person)

    for ln in lines:
        if not ln:
            continue

        bm = _BLOCK_RE_V3.match(ln)
        if bm:
            flush_row()
            current_project = int(bm.group(1))
            in_hr = False
            continue

        if _V3_STOP_RE.search(_norm(ln)):
            flush_row()
            in_hr = False
            continue

        if _HR_HEADER_RE.search(_norm(ln)):
            flush_row()
            in_hr = True
            continue

        if not in_hr:
            continue

        # Skip the column-header line (CPF NOME TITULAÇÃO FUNÇÃO ...)
        if _HR_COL_HEADER_RE.search(ln):
            continue

        if "NENHUM REGISTRO" in _norm(ln):
            in_hr = False
            continue

        if _CPF_ROW_RE.match(ln):
            # New CPF-anchored row: flush previous
            flush_row()
            current_row_lines.append(ln)
        elif current_row_lines:
            # Continuation line of the current record (multi-line PyMuPDF output)
            current_row_lines.append(ln)

    flush_row()
    return results


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def parse_hr(text: str, family: str | None = None) -> list[dict]:
    """
    Extract human resources linked to project items (FORMP&D).
    Dispatches to the correct sub-parser based on form version family.
    Returns a flat list with `project_index` so caller can merge into each project.

    family values: 'v1_legacy_2017_2018' | 'v2_intermediate_2019_2022' | 'v3_modern_2023_plus'
    """
    lines = [_clean(ln) for ln in (text or "").splitlines() if _clean(ln)]

    if family == "v3_modern_2023_plus":
        return _parse_hr_v3_table(text)

    if family == "v1_legacy_2017_2018":
        return _parse_numbered_hr(lines, _V1_SECTION_RE)

    # v2 or unknown: strict v2 pattern first, fall back to v1 pattern
    results = _parse_numbered_hr(lines, _V2_SECTION_RE)
    if not results:
        results = _parse_numbered_hr(lines, _V1_SECTION_RE)
    return results
