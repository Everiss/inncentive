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


def _keep_leaf_spends(entries: list[dict]) -> list[dict]:
    """
    Keep only leaf lines in hierarchical spending tables.
    If an entry has descendants with positive values, it is an aggregate parent.
    """
    if not entries:
        return entries

    out: list[dict] = []
    n = len(entries)
    for i, cur in enumerate(entries):
        cur_level = int(cur.get("level") or 0)
        has_positive_child = False
        for j in range(i + 1, n):
            nxt = entries[j]
            nxt_level = int(nxt.get("level") or 0)
            if nxt_level <= cur_level:
                break
            if float(nxt.get("amount") or 0) > 0:
                has_positive_child = True
                break
        if not has_positive_child:
            out.append(cur)
    return out


def parse_expenses(text: str) -> list[dict]:
    """
    Extract expenses by project (v3 layout).
    Returns a flat list with project_index, category and amount.
    Hierarchical tables are pruned to leaf rows only.
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

            # B) category line + amount in the next line
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

    results = _dedupe_exact(results)

    by_project: dict[int, list[dict]] = {}
    for r in results:
        by_project.setdefault(int(r.get("project_index") or 1), []).append(r)

    pruned: list[dict] = []
    for _, entries in by_project.items():
        pruned.extend(_keep_leaf_spends(entries))

    return [
        {
            "project_index": int(r.get("project_index") or 1),
            "category": r.get("category"),
            "amount": r.get("amount"),
        }
        for r in pruned
    ]
