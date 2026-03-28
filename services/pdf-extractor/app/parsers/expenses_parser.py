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


def _indent_level(raw_line: str) -> int:
    line = (raw_line or "").replace("\t", "    ")
    return len(line) - len(line.lstrip(" "))


def _extract_money(value: str) -> float | None:
    m = re.search(r"R\$\s*([0-9\.\,]+)", value or "", re.IGNORECASE)
    if not m:
        return None
    raw = m.group(1).replace(".", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def _is_header_or_total(category: str) -> bool:
    n = _norm(category)
    return n in {
        "DISPENDIO",
        "VALOR R$ ANO-BASE",
        "VALOR R$ ANO BASE",
        "TOTAL",
        "TOTAL GERAL",
    }


def _dedupe_exact(entries: list[dict]) -> list[dict]:
    seen: set[tuple[int, str, float]] = set()
    out: list[dict] = []
    for e in entries:
        key = (
            int(e.get("project_index") or 0),
            _norm(str(e.get("category") or "")),
            round(float(e.get("amount") or 0), 2),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


# ---------------------------------------------------------------------------
# Semantic hierarchy resolver (replaces indentation-based _keep_leaf_spends)
# ---------------------------------------------------------------------------

# Category name prefixes that are always aggregate parents in FORMPD tables.
# These labels group subordinate line items and should never be counted directly.
_AGGREGATOR_PREFIXES = {
    "SERVICOS DE TERCEIROS",
    "SERVICO DE APOIO TECNICO",
    "MATERIAL DE CONSUMO",
    "DESPESAS OPERACIONAIS",
    "TECNOLOGIA INDUSTRIAL BASICA",
    "TIB",
    "VIAGENS",
    "PASSAGENS",
    "DIARIAS",
    "EQUIPAMENTOS E MATERIAL PERMANENTE",
    "TOTAL GERAL",
    "TOTAL",
}


def _is_aggregator(entry: dict, entries: list[dict], idx: int) -> bool:
    """
    Return True if `entry` is a parent/aggregate row that sums its children.
    Two independent signals — either is sufficient:
      1. Category name matches a known aggregator prefix.
      2. The entry's amount equals the running sum of the next N entries
         in the same project (within 3% tolerance).
    """
    amount = float(entry.get("amount") or 0)
    if amount <= 0:
        return False

    cat_norm = _norm(str(entry.get("category") or ""))
    for prefix in _AGGREGATOR_PREFIXES:
        if cat_norm.startswith(prefix):
            return True

    proj = entry.get("project_index")
    running = 0.0
    for nxt in entries[idx + 1 :]:
        if nxt.get("project_index") != proj:
            break
        nxt_amount = float(nxt.get("amount") or 0)
        if nxt_amount <= 0:
            continue
        running += nxt_amount
        if running > 0 and abs(running - amount) / amount < 0.03:
            return True
        if running > amount * 1.03:
            break

    return False


def _keep_leaf_spends(entries: list[dict]) -> list[dict]:
    """
    Keep only leaf (non-aggregate) expense rows.
    Uses semantic heuristics instead of indentation (which PyMuPDF strips).
    """
    if not entries:
        return entries
    return [e for i, e in enumerate(entries) if not _is_aggregator(e, entries, i)]


# ---------------------------------------------------------------------------
# v3 parser — PROGRAMA/ATIVIDADES DE PD&I blocks
# ---------------------------------------------------------------------------


def _parse_expenses_v3(text: str) -> list[dict]:
    """
    Extract expenses from v3 FORMPD (PROGRAMA/ATIVIDADES DE PD&I - N blocks).
    """
    raw_lines = (text or "").splitlines()
    rows: list[dict] = []
    for ln in raw_lines:
        clean = _clean(ln)
        if not clean:
            continue
        rows.append(
            {
                "raw": ln,
                "clean": clean,
                "norm": _norm(clean),
                "indent": _indent_level(ln),
            }
        )

    block_re = re.compile(r"^PROGRAMA/ATIVIDADES DE PD&I\s*-\s*(\d+)", re.IGNORECASE)
    idxs = [i for i, row in enumerate(rows) if block_re.match(row["clean"])]
    if not idxs:
        return []

    results: list[dict] = []

    for n, start in enumerate(idxs):
        end = idxs[n + 1] if n + 1 < len(idxs) else len(rows)
        block = rows[start:end]

        m = block_re.match(block[0]["clean"])
        project_idx = int(m.group(1)) if m else (n + 1)

        in_items = False
        i = 0
        while i < len(block):
            row = block[i]
            ln = row["clean"]
            nln = row["norm"]

            if "ITENS DE DISPENDIO" in nln:
                in_items = True
                i += 1
                continue

            if not in_items:
                i += 1
                continue

            if "RECURSOS HUMANOS ENVOLVIDOS NO PROJETO" in nln:
                break
            if "FONTES DE FINANCIAMENTO" in nln and "PROJETO" in nln:
                i += 1
                continue
            if "INCENTIVOS FISCAIS DO PROGRAMA" in nln:
                break

            # A) category and amount in the same line
            same_line_amount = _extract_money(ln)
            if same_line_amount is not None:
                category = re.sub(r"R\$\s*[0-9\.\,]+", "", ln, flags=re.IGNORECASE).strip(" :-")
                if category and not _is_header_or_total(category) and same_line_amount > 0:
                    results.append(
                        {
                            "project_index": project_idx,
                            "category": category,
                            "amount": same_line_amount,
                            "level": row["indent"],
                        }
                    )
                i += 1
                continue

            # B) category line + amount on the next line
            if i + 1 < len(block):
                amount = _extract_money(block[i + 1]["clean"])
                if amount is not None:
                    category = ln.strip(" :")
                    if category and not _is_header_or_total(category) and amount > 0:
                        results.append(
                            {
                                "project_index": project_idx,
                                "category": category,
                                "amount": amount,
                                "level": row["indent"],
                            }
                        )
                    i += 2
                    continue

            i += 1

    return results


# ---------------------------------------------------------------------------
# v1 / v2 numbered section parser
# ---------------------------------------------------------------------------

# Expense-section heading: "3.1.X.X.X. [Item N] CATEGORY_LABEL"
# The [Item N] gives the project_index; absent → derive from "3.1.X."
_EXPENSE_SECTION_RE = re.compile(
    r"^3\.1\.\d+(?:\.\d+){1,4}\.\s*"
    r"(?:\[ITEM\s*(\d+)\]\s*)?"
    r"(SERVI[CÇ]O|MATERIAL|TIB|TECNOLOGIA INDUSTRIAL|VIAGEN?S?|"
    r"INVENTOR|EMPRESA COOPERADORA|UNIVERSIDADE|INSTITUI|EQUIPAMENTO)",
    re.IGNORECASE,
)


def _get_project_idx_from_section(line: str, fallback: int = 1) -> int:
    """Derive project index: [Item N] takes priority, then 3.1.X. prefix."""
    item_m = re.search(r"\[ITEM\s*(\d+)\]", line, re.IGNORECASE)
    if item_m:
        return int(item_m.group(1))
    num_m = re.match(r"^3\.1\.(\d+)\.", line)
    if num_m:
        return int(num_m.group(1))
    return fallback


def _parse_expenses_numbered(text: str) -> list[dict]:
    """
    Extract expenses from v1/v2 FORMPD numbered sections.
    Each section starts with "3.1.X.X.X. [Item N] CATEGORY".
    Within each section, individual expenses begin with "Item M".
    """
    lines = [_clean(ln) for ln in (text or "").splitlines()]
    lines = [ln for ln in lines if ln]

    results: list[dict] = []
    fallback_proj = 1

    i = 0
    while i < len(lines):
        line = lines[i]
        sm = _EXPENSE_SECTION_RE.match(line)
        if not sm:
            i += 1
            continue

        project_idx = _get_project_idx_from_section(line, fallback_proj)
        fallback_proj = max(fallback_proj, project_idx)

        # The category is everything after [Item N] (or after the section number)
        # Strip leading "3.1.X.X.X. [Item N] " prefix
        category_raw = re.sub(
            r"^3\.1\.\d+(?:\.\d+){1,4}\.\s*(?:\[ITEM\s*\d+\]\s*)?",
            "",
            line,
            flags=re.IGNORECASE,
        ).strip(" :-")

        j = i + 1
        current: dict | None = None

        def flush(cur: dict | None) -> None:
            if cur and cur.get("amount") is not None and cur["amount"] > 0:
                results.append(cur)

        while j < len(lines):
            ln = lines[j]
            n = _norm(ln)

            # Next numbered heading = end of this section
            if re.match(r"^3\.1\.\d+(?:\.\d+)+\.\s*", ln):
                flush(current)
                break

            # New item within this section
            if re.match(r"^ITEM\s+\d+", n):
                flush(current)
                current = {
                    "project_index": project_idx,
                    "category": category_raw,
                    "amount": None,
                    "description": None,
                    "supplier_cnpj_raw": None,
                    "supplier_name": None,
                    "service_status": None,
                }
                j += 1
                continue

            if current is None:
                j += 1
                continue

            # Field extraction within an Item block
            if n.startswith("CNPJ ") or n.startswith("CPF "):
                raw_id = ln.split(" ", 1)[1].strip() if " " in ln else None
                current["supplier_cnpj_raw"] = raw_id
            elif n.startswith("NOME "):
                current["supplier_name"] = ln.split(" ", 1)[1].strip() if " " in ln else None
            elif "VALOR TOTAL (R$" in n or "VALOR (R$" in n:
                current["amount"] = _extract_money(ln)
            elif "CARACTERIZAR" in n or "DESCRICAO" in n:
                # Grab the rest of this line and optionally the next
                desc = re.sub(r"^[^:]+:\s*", "", ln).strip()
                if not desc and j + 1 < len(lines):
                    desc = lines[j + 1].strip()
                    j += 1
                current["description"] = desc or None
            elif n.startswith("SITUACAO") or n.startswith("SITUAÇÃO"):
                status_raw = re.sub(r"^SITUA[CÇ][AÃ]O\s*[:\-]?\s*", "", ln, flags=re.IGNORECASE)
                current["service_status"] = status_raw.strip() or None

            j += 1

        flush(current)
        i = j

    return results


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def parse_expenses(text: str, family: str | None = None) -> list[dict]:
    """
    Extract project expenses (FORMP&D).
    Dispatches to the correct sub-parser based on form version family.
    Returns a flat list with `project_index`, `category`, `amount` (plus optional
    `supplier_cnpj_raw`, `supplier_name`, `service_status` for v1/v2).

    family values: 'v1_legacy_2017_2018' | 'v2_intermediate_2019_2022' | 'v3_modern_2023_plus'
    """
    if family == "v3_modern_2023_plus":
        results = _parse_expenses_v3(text)
    elif family in ("v1_legacy_2017_2018", "v2_intermediate_2019_2022"):
        results = _parse_expenses_numbered(text)
    else:
        # Unknown: try v3 first (more structured), fall back to numbered
        results = _parse_expenses_v3(text)
        if not results:
            results = _parse_expenses_numbered(text)

    results = _dedupe_exact(results)

    by_project: dict[int, list[dict]] = {}
    for r in results:
        by_project.setdefault(int(r.get("project_index") or 1), []).append(r)

    pruned: list[dict] = []
    for _, entries in by_project.items():
        pruned.extend(_keep_leaf_spends(entries))

    # Return canonical fields always present + optional enrichment fields
    out = []
    for r in pruned:
        item: dict = {
            "project_index": int(r.get("project_index") or 1),
            "category": r.get("category"),
            "amount": r.get("amount"),
        }
        # Pass through v1/v2 enrichment fields when present
        for extra in ("description", "supplier_cnpj_raw", "supplier_name", "service_status"):
            if r.get(extra) is not None:
                item[extra] = r[extra]
        out.append(item)

    return out
