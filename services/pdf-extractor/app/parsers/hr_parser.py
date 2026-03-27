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


def parse_hr(text: str) -> list[dict]:
    """
    Extract human resources linked to project items (FORMP&D).
    Returns a flat list with `project_index` so caller can merge into each project.
    """
    lines = [_clean(ln) for ln in (text or "").splitlines()]
    lines = [ln for ln in lines if ln]

    # Most reliable start marker in 2019+ samples.
    section_re = re.compile(
        r"^3\.1\.\d+\.\d+\.\d+\.\s*(?:\[ITEM\s*(\d+)\]\s*)?RELA[CÇ][AÃ]O DE RECURSOS HUMANOS",
        re.IGNORECASE,
    )

    results: list[dict] = []
    fallback_project_idx = 1

    i = 0
    while i < len(lines):
        line = lines[i]
        m = section_re.match(line)
        if not m:
            i += 1
            continue

        project_idx = int(m.group(1) or fallback_project_idx)
        fallback_project_idx = max(fallback_project_idx, project_idx)

        j = i + 1
        current: dict | None = None

        while j < len(lines):
            ln = lines[j]
            n = _norm(ln)

            if _is_numbered_heading(ln):
                # next subsection / item
                if current and any(current.get(k) for k in ("name", "cpf", "annual_amount", "annual_hours")):
                    results.append(current)
                break

            if "NENHUM REGISTRO ADICIONADO" in n:
                if current and any(current.get(k) for k in ("name", "cpf", "annual_amount", "annual_hours")):
                    results.append(current)
                current = None
                # section sem dados
                break

            if re.match(r"^ITEM\s+\d+", n):
                if current and any(current.get(k) for k in ("name", "cpf", "annual_amount", "annual_hours")):
                    results.append(current)
                current = {
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
                j += 1
                continue

            if current is None:
                j += 1
                continue

            if n.startswith("CPF "):
                cpf_digits = re.sub(r"\D", "", ln)
                current["cpf"] = cpf_digits or None
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
                if dnorm.startswith("EXCLUSIVA"):
                    current["dedication_pct"] = 100
                elif dnorm.startswith("PARCIAL"):
                    current["dedication_pct"] = None
            elif n.startswith("VALOR (R$") or n.startswith("VALOR TOTAL (R$") or n.startswith("VALOR R$"):
                current["annual_amount"] = _extract_money(ln)

            j += 1

        if current and any(current.get(k) for k in ("name", "cpf", "annual_amount", "annual_hours")):
            results.append(current)
        i = j + 1

    return results
