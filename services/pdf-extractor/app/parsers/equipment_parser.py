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


def _origin_from_category(category: str) -> str | None:
    n = _norm(category)
    if "EQUIPAMENTOS NACIONAIS" in n:
        return "NACIONAL"
    if "EQUIPAMENTOS IMPORTADOS" in n:
        return "IMPORTADO"
    return None


def parse_equipment(text: str) -> list[dict]:
    """
    Extract project equipment lines when present (mainly modern v3 layouts).
    Returns flat rows with `project_index` for merge.
    """
    lines = [_clean(ln) for ln in (text or "").splitlines()]
    lines = [ln for ln in lines if ln]

    block_re = re.compile(r"^PROGRAMA/ATIVIDADES DE PD&I\s*-\s*(\d+)", re.IGNORECASE)
    idxs = [i for i, ln in enumerate(lines) if block_re.match(ln)]
    if not idxs:
        return []

    results: list[dict] = []

    for n, start in enumerate(idxs):
        end = idxs[n + 1] if n + 1 < len(idxs) else len(lines)
        block = lines[start:end]
        m = block_re.match(block[0])
        project_idx = int(m.group(1)) if m else (n + 1)

        in_items = False
        i = 0
        while i < len(block) - 1:
            ln = block[i]
            nln = _norm(ln)

            if "ITENS DE DISPENDIO" in nln:
                in_items = True
                i += 1
                continue

            if not in_items:
                i += 1
                continue

            if "RECURSOS HUMANOS ENVOLVIDOS NO PROJETO" in nln:
                break
            if "INCENTIVOS FISCAIS DO PROGRAMA" in nln:
                break

            origin = _origin_from_category(ln)
            if origin:
                amount = _extract_money(block[i + 1])
                if amount is not None and amount > 0:
                    results.append(
                        {
                            "project_index": project_idx,
                            "origin": origin,
                            "description": ln.strip(" :"),
                            "amount": amount,
                        }
                    )
                    i += 2
                    continue

            i += 1

    return results
