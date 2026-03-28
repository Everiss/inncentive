"""
third_party_services_parser.py

Parses "RELAÇÃO DOS SERVIÇOS DE TERCEIROS - VALORES TRANSFERIDOS" sections
found in v3_modern (2023+) FORMPD forms.

Actual layout observed in v3_late (AB2024) PDFs:
  Each PROGRAMA/ATIVIDADES DE PD&I - N block contains one or more occurrences
  of "RELAÇÃO DOS SERVIÇOS DE TERCEIROS - VALORES TRANSFERIDOS", each followed
  by a subsection header (MICROEMPRESAS or SERVIÇO DE APOIO TÉCNICO...) and
  then individual entries separated by "SUBSECTION - N" item marker lines.

  Entry structure:
    MICROEMPRESAS - 1                              ← item marker (subsection + number)
    CNPJ / RAZÃO SOCIAL / SITUAÇÃO:               ← label line (ignored)
    28.683.400/0001-68 / APPONTA / Terminado       ← values on NEXT line, slash-separated
    VALOR TOTAL R$:                                ← label line
    R$ 295.540,79                                  ← amount on NEXT line
    DESCRIÇÃO DAS ATIVIDADES...:                   ← label + optional inline text
    [multi-line description...]

    SERVIÇO DE APOIO TÉCNICO... - PESSOA JURÍDICA - 1  ← item marker
    TIPO DE SERVIÇO:                               ← label line
    Serviço de Apoio Técnico                       ← service type on next line
    CNPJ / RAZÃO SOCIAL / SITUAÇÃO:
    XX.XXX.XXX/XXXX-XX / Name / Situação
    VALOR TOTAL R$:
    R$ nnn.nnn,nn
    DESCRIÇÃO...:

Returns flat list with project_index for merge into project.expenses.
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


# Noise lines to skip (page headers, auth codes)
_NOISE_RE = re.compile(
    r"^(PAGINA|P\?GINA|P[AÁ]GINA|CODIGO DE AUTENTICIDADE|C[OÓ]DIGO DE AUTENTICIDADE|GERADO EM|\d+\s*$)",
    re.IGNORECASE,
)

# An item marker line ends with " - <number>" where the prefix matches a known
# subsection type OR is a generic numbered item.
# Examples: "MICROEMPRESAS - 1", "SERVIÇO DE APOIO TÉCNICO... - PESSOA JURÍDICA - 3"
_ITEM_MARKER_RE = re.compile(r"\s*-\s*(\d+)\s*$")

# Known subsection type prefixes (normalized, accent-stripped)
_SUBSECTION_PREFIXES = (
    "MICROEMPRESAS",
    "SERVICO DE APOIO TECNICO",
    "TECNOLOGIA INDUSTRIAL BASICA",
    "TIB",
    "DESPESAS OPERACIONAIS",
    "EMPRESA COOPERADORA",
)

# Stop markers — indicates we've left the RELAÇÃO section
_STOP_MARKERS = (
    "RELACAO DE RECURSOS HUMANOS",
    "RECURSOS HUMANOS ENVOLVIDOS NO PROJETO",
    "INCENTIVOS FISCAIS DO PROGRAMA",
    "PROGRAMA/ATIVIDADES DE PD",
    "RESUMO DOS DISPENDIOS",
    "FONTES DE FINANCIAMENTO",
)


def _is_noise(norm_line: str) -> bool:
    return bool(_NOISE_RE.match(norm_line))


def _item_number(norm_line: str) -> int | None:
    """If norm_line looks like 'SUBSECTION - N', return N, else None."""
    m = _ITEM_MARKER_RE.search(norm_line)
    if not m:
        return None
    # The prefix before ' - N' must start with a known subsection type
    prefix = norm_line[: m.start()].strip()
    for sub in _SUBSECTION_PREFIXES:
        if prefix.startswith(sub):
            return int(m.group(1))
    return None


def _subsection_type(norm_line: str) -> str | None:
    """Return the matching prefix if this is a standalone subsection header."""
    for sub in _SUBSECTION_PREFIXES:
        if norm_line.startswith(sub):
            return sub
    return None


def _flush(current: dict | None, results: list) -> None:
    if current and current.get("amount") is not None and float(current["amount"]) > 0:
        results.append(current)


def _parse_cnpj_name_status(value_line: str) -> tuple[str | None, str | None, str | None]:
    """
    Parse 'CNPJ / Razão Social / Situação' from a single slash-delimited line.
    Returns (cnpj, name, status) — any may be None if parsing fails.
    """
    parts = [p.strip() for p in value_line.split("/") if p.strip()]
    if len(parts) >= 4:
        # CNPJ has internal slashes: "XX.XXX.XXX/XXXX-XX"
        # Reconstruct: first token is start of CNPJ, second is end (XXXX-XX)
        # Then name, then status (last part)
        # Typical: ['28.683.400', '0001-68', 'APPONTA DADOS LTDA', 'Terminado']
        cnpj = f"{parts[0]}/{parts[1]}"
        name = parts[2] if len(parts) > 2 else None
        status = parts[-1] if len(parts) > 3 else None
        return cnpj, name, status
    elif len(parts) == 3:
        return parts[0], parts[1], parts[2]
    elif len(parts) == 2:
        return parts[0], parts[1], None
    elif len(parts) == 1:
        return parts[0], None, None
    return None, None, None


def parse_third_party_services(text: str) -> list[dict]:
    """
    Extract individual supplier entries from all RELAÇÃO DOS SERVIÇOS DE TERCEIROS
    sections within PROGRAMA/ATIVIDADES DE PD&I blocks.

    Returns flat list of dicts with:
        project_index, category, supplier_cnpj_raw, supplier_name,
        service_status, service_type, amount, description
    Only entries with a non-zero amount are included.
    """
    lines = [_clean(ln) for ln in (text or "").splitlines()]
    lines = [ln for ln in lines if ln]

    block_re = re.compile(r"^PROGRAMA/ATIVIDADES DE PD&I\s*-\s*(\d+)", re.IGNORECASE)
    proj_idxs = [i for i, ln in enumerate(lines) if block_re.match(ln)]
    if not proj_idxs:
        return []

    results: list[dict] = []

    for n, proj_start in enumerate(proj_idxs):
        proj_end = proj_idxs[n + 1] if n + 1 < len(proj_idxs) else len(lines)
        block = lines[proj_start:proj_end]

        m = block_re.match(block[0])
        project_idx = int(m.group(1)) if m else (n + 1)

        # Find all RELAÇÃO DOS SERVIÇOS sections within this block
        terceiros_starts = [
            i for i, ln in enumerate(block)
            if "RELACAO DOS SERVICOS DE TERCEIROS" in _norm(ln)
        ]

        if not terceiros_starts:
            continue

        for t_start in terceiros_starts:
            current_subsection = "SERVIÇOS DE TERCEIROS"
            current: dict | None = None

            # Determine the end of this terceiros section
            # It ends when we hit a stop marker OR another terceiros section OR end of block
            next_t = next(
                (s for s in terceiros_starts if s > t_start),
                None,
            )
            t_end = next_t if next_t is not None else len(block)

            i = t_start + 1
            expect_cnpj_value = False     # next non-noise line is CNPJ/Name/Status
            expect_amount_value = False   # next non-noise line is the R$ amount
            expect_service_type = False   # next non-noise line is service type
            collecting_desc = False       # collecting multi-line description

            while i < t_end:
                ln = block[i]
                nln = _norm(ln)

                if not nln:
                    i += 1
                    continue

                # Skip page noise lines
                if _is_noise(nln):
                    i += 1
                    continue

                # Hard stop markers
                if any(marker in nln for marker in _STOP_MARKERS):
                    _flush(current, results)
                    current = None
                    break

                # ── Pending value flags (highest priority) ──────────────────
                # Must be checked BEFORE subsection/item detection because some
                # service type values (e.g. "Serviço de Apoio Técnico") can be
                # mistakenly classified as subsection headers.

                if expect_cnpj_value:
                    cnpj, name, status = _parse_cnpj_name_status(ln)
                    if current is not None:
                        if cnpj:
                            current["supplier_cnpj_raw"] = cnpj
                        if name:
                            current["supplier_name"] = name
                        if status:
                            current["service_status"] = status
                    expect_cnpj_value = False
                    i += 1
                    continue

                if expect_amount_value:
                    amt = _extract_money(ln)
                    if amt is not None and current is not None:
                        current["amount"] = amt
                    expect_amount_value = False
                    i += 1
                    continue

                if expect_service_type:
                    if current is not None:
                        current["service_type"] = ln.strip() or None
                    expect_service_type = False
                    i += 1
                    continue

                if collecting_desc and current is not None:
                    # Keep collecting description until we see a field label or item marker
                    if re.match(r"^(CNPJ|TIPO DE SERVI|VALOR TOTAL|DESCRI)", nln) or _item_number(nln) is not None or _subsection_type(nln) is not None:
                        collecting_desc = False
                        # Don't advance — re-process this line
                        continue
                    existing = current.get("description") or ""
                    current["description"] = (existing + " " + ln).strip()
                    i += 1
                    continue

                # ── Subsection header (no trailing number) ──────────────────
                sub = _subsection_type(nln)
                item_num = _item_number(nln)

                if item_num is not None:
                    # This is an item marker line: "SUBSECTION - N"
                    _flush(current, results)
                    current = {
                        "project_index": project_idx,
                        "category": current_subsection,
                        "supplier_cnpj_raw": None,
                        "supplier_name": None,
                        "service_status": None,
                        "service_type": None,
                        "amount": None,
                        "description": None,
                    }
                    expect_cnpj_value = False
                    expect_amount_value = False
                    expect_service_type = False
                    collecting_desc = False
                    i += 1
                    continue

                if sub is not None and item_num is None:
                    # Pure subsection header (no number)
                    _flush(current, results)
                    current = None
                    current_subsection = ln.strip()
                    collecting_desc = False
                    expect_cnpj_value = False
                    expect_amount_value = False
                    expect_service_type = False
                    i += 1
                    continue

                # ── Label line detection ─────────────────────────────────────
                if re.match(r"^CNPJ\s*/\s*RAZ", nln):
                    expect_cnpj_value = True
                    i += 1
                    continue

                if re.match(r"^VALOR\s+TOTAL\s+R\$", nln):
                    # Value may be inline or on next line
                    amt = _extract_money(ln)
                    if amt is not None and current is not None:
                        current["amount"] = amt
                    else:
                        expect_amount_value = True
                    i += 1
                    continue

                if re.match(r"^TIPO DE SERVI", nln):
                    # Inline or next line
                    inline = re.sub(r"^TIPO DE SERVI[CÇ]O\s*:\s*", "", ln, flags=re.IGNORECASE).strip()
                    if inline and current is not None:
                        current["service_type"] = inline
                    elif current is not None:
                        expect_service_type = True
                    i += 1
                    continue

                if re.match(r"^DESCRI", nln):
                    # Inline text after colon
                    inline = re.sub(r"^[^:]+:\s*", "", ln).strip()
                    if current is not None:
                        current["description"] = inline or None
                        collecting_desc = True
                    i += 1
                    continue

                i += 1

            _flush(current, results)

    return results
