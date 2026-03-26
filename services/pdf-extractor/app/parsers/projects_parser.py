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


def _is_noise(line: str) -> bool:
    n = _norm(line)
    if not n:
        return True
    markers = (
        "MINISTERIO DA CIENCIA",
        "GERADO EM",
        "PAGINA:",
        "CODIGO DE AUTENTICIDADE",
        "ORIENTACOES",
        "APRESENTACAO:",
        "PAGINA DE",
    )
    return any(m in n for m in markers)


def _is_numbered_heading(line: str) -> bool:
    return bool(re.match(r"^\d+(?:\.\d+){1,3}\.?\s+", line or ""))


def _next_non_empty(lines: list[str], start: int, max_lookahead: int = 12) -> tuple[str, int] | None:
    for i in range(start, min(len(lines), start + max_lookahead)):
        candidate = _clean(lines[i])
        if not candidate:
            continue
        if _is_noise(candidate):
            continue
        return candidate, i
    return None


def _extract_multiline_value(lines: list[str], start: int, max_len: int = 2000) -> tuple[str, int]:
    parts: list[str] = []
    i = start
    while i < len(lines):
        ln = _clean(lines[i])
        if not ln:
            i += 1
            continue
        if _is_noise(ln):
            i += 1
            continue
        if _is_numbered_heading(ln):
            break
        if re.match(r"^PROGRAMA/ATIVIDADES DE PD&I\s*-\s*\d+", ln, re.IGNORECASE):
            break
        parts.append(ln)
        if len(" ".join(parts)) >= max_len:
            break
        i += 1
    return " ".join(parts).strip()[:max_len], i


def _is_v3_label_line(line: str) -> bool:
    n = _norm(line)
    return any(
        k in n
        for k in (
            "ITEM/NOME DA ATIVIDADE DE PD&I",
            "ITEM/TITULO DO PROJETO DE PD&I",
            "DESCRICAO DO PROJETO",
            "CATEGORIA PREDOMINANTE",
            "PB, PA OU DE",
            "O PROJETO E CONTINUO",
            "A ATIVIDADE E CONTINUA",
            "AREA DO PROJETO",
            "PALAVRAS-CHAVE",
            "NATUREZA",
            "ELEMENTO TECNOLOGICAMENTE",
            "QUAL A BARREIRA",
            "METODOLOGIA",
            "DETALHAMENTOS ADICIONAIS",
        )
    )


def _extract_value_after_label(lines: list[str], label_idx: int, max_lines: int = 24) -> str | None:
    parts: list[str] = []
    for i in range(label_idx + 1, min(len(lines), label_idx + 1 + max_lines)):
        ln = _clean(lines[i])
        if not ln:
            continue
        if _is_noise(ln):
            continue
        if re.match(r"^PROGRAMA/ATIVIDADES DE PD&I\s*-\s*\d+", ln, re.IGNORECASE):
            break
        if _is_v3_label_line(ln):
            break
        if _is_numbered_heading(ln):
            break
        if _norm(ln) in {"NO ANO-BASE:", "INICIAL:", "FINAL:"}:
            continue
        parts.append(ln)
    if not parts:
        return None
    return " ".join(parts).strip()


def _map_category(raw: str | None) -> str | None:
    n = _norm(raw or "")
    if not n:
        return None
    if "PESQUISA BASICA" in n or re.search(r"\bPB\b", n):
        return "PESQUISA_BASICA"
    if "PESQUISA APLICADA" in n or re.search(r"\bPA\b", n):
        return "PESQUISA_APLICADA"
    if "DESENVOLVIMENTO EXPERIMENTAL" in n or re.search(r"\bDE\b", n):
        return "DESENVOLVIMENTO_EXPERIMENTAL"
    if "INOVACAO TECNOLOGICA" in n:
        return "INOVACAO_TECNOLOGICA"
    return None


def _parse_yes_no(raw: str | None) -> bool | None:
    n = _norm(raw or "")
    if not n:
        return None
    if n.startswith("SIM") or n == "S":
        return True
    if n.startswith("NAO") or n == "N":
        return False
    return None


def _extract_marked_option(lines: list[str], start_idx: int, max_lookahead: int = 8) -> str | None:
    opt_re = re.compile(r"^\(\s*([OX])\s*\)\s*(.+)$", re.IGNORECASE)
    for i in range(start_idx, min(len(lines), start_idx + max_lookahead)):
        ln = _clean(lines[i])
        if not ln:
            continue
        if _is_noise(ln):
            continue
        m = opt_re.match(ln)
        if m and m.group(1).upper() == "O":
            return m.group(2).strip()
        if _is_numbered_heading(ln):
            break
    return None


def _new_project(idx: int) -> dict:
    return {
        "title": f"Projeto {idx}",
        "description": "",
        "category": None,
        "is_continuous": None,
        "human_resources": [],
        "expenses": [],
        "equipment": [],
    }


def _extract_item_idx(line: str) -> int | None:
    m = re.search(r"\[\s*ITEM\s*(\d+)\s*\]", line or "", re.IGNORECASE)
    return int(m.group(1)) if m else None


def _parse_legacy_v1_v2(lines: list[str]) -> list[dict]:
    projects: dict[int, dict] = {}

    title_re = re.compile(r"^3\.1\.1\.", re.IGNORECASE)
    section_re = re.compile(r"^3\.1\.\d+\.", re.IGNORECASE)
    fallback_item = 1

    for i, raw in enumerate(lines):
        line = _clean(raw)
        if not line:
            continue
        nline = _norm(line)

        if title_re.match(line) and "NOME DA ATIVIDADE DE PD&I" in nline:
            item = _extract_item_idx(line) or fallback_item
            next_val = _next_non_empty(lines, i + 1)
            if item not in projects:
                projects[item] = _new_project(item)
            if next_val:
                val = next_val[0]
                if not _is_numbered_heading(val):
                    projects[item]["title"] = val[:500]
            fallback_item = max(fallback_item, item)
            continue

        if section_re.match(line) and "PB, PA OU DE" in nline:
            item = _extract_item_idx(line) or fallback_item
            if item not in projects:
                projects[item] = _new_project(item)
            next_val = _next_non_empty(lines, i + 1)
            if next_val:
                projects[item]["category"] = _map_category(next_val[0])
            continue

        if section_re.match(line) and (
            "DESCRICAO DO PROJETO" in nline or "DESTAQUE O ELEMENTO" in nline
        ):
            item = _extract_item_idx(line) or fallback_item
            if item not in projects:
                projects[item] = _new_project(item)
            desc, _ = _extract_multiline_value(lines, i + 1, max_len=1500)
            if desc:
                projects[item]["description"] = desc
            continue

        if section_re.match(line) and (
            "ATIVIDADE E CONTINUA" in nline or "PROJETO E CONTINUO" in nline
        ):
            item = _extract_item_idx(line) or fallback_item
            if item not in projects:
                projects[item] = _new_project(item)
            marked = _extract_marked_option(lines, i + 1)
            if marked:
                projects[item]["is_continuous"] = _parse_yes_no(marked)
            else:
                next_val = _next_non_empty(lines, i + 1)
                if next_val:
                    projects[item]["is_continuous"] = _parse_yes_no(next_val[0])
            continue

    if not projects:
        return []
    return [projects[k] for k in sorted(projects.keys())]


def _parse_modern_v3(lines: list[str]) -> list[dict]:
    projects: list[dict] = []
    block_re = re.compile(r"^PROGRAMA/ATIVIDADES DE PD&I\s*-\s*(\d+)", re.IGNORECASE)

    idxs = [i for i, ln in enumerate(lines) if block_re.match(_clean(ln))]
    if not idxs:
        return []

    for n, start in enumerate(idxs):
        end = idxs[n + 1] if n + 1 < len(idxs) else len(lines)
        block = lines[start:end]
        block_norm = [_norm(ln) for ln in block]
        p = _new_project(len(projects) + 1)

        title_idx = next(
            (
                i
                for i, ln in enumerate(block_norm)
                if "ITEM/NOME DA ATIVIDADE DE PD&I" in ln or "ITEM/TITULO DO PROJETO DE PD&I" in ln
            ),
            None,
        )
        if title_idx is not None:
            title = _extract_value_after_label(block, title_idx)
            if title:
                title = re.sub(r"^\d+\.\s*", "", title).strip()
                p["title"] = title[:500]

        desc_idx = next((i for i, ln in enumerate(block_norm) if "DESCRICAO DO PROJETO" in ln), None)
        if desc_idx is not None:
            desc = _extract_value_after_label(block, desc_idx)
            if desc:
                p["description"] = desc[:1500]

        cat_idx = next((i for i, ln in enumerate(block_norm) if "CATEGORIA PREDOMINANTE" in ln), None)
        pb_idx = next((i for i, ln in enumerate(block_norm) if "PB, PA OU DE" in ln), None)
        cat_val = _extract_value_after_label(block, cat_idx) if cat_idx is not None else None
        pb_val = _extract_value_after_label(block, pb_idx) if pb_idx is not None else None
        p["category"] = _map_category(cat_val or pb_val)

        cont_idx = next(
            (
                i
                for i, ln in enumerate(block_norm)
                if "ATIVIDADE E CONTINUA" in ln or "PROJETO E CONTINUO" in ln
            ),
            None,
        )
        if cont_idx is not None:
            cont = _extract_value_after_label(block, cont_idx, max_lines=8)
            p["is_continuous"] = _parse_yes_no(cont)

        projects.append(p)

    return projects


def parse_projects(text: str, profile: str | None = None) -> list[dict]:
    lines = [_clean(ln) for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]

    if profile == "v3_modern_2023_plus":
        projects = _parse_modern_v3(lines)
    else:
        projects = _parse_legacy_v1_v2(lines)
        if not projects:
            projects = _parse_modern_v3(lines)

    if not projects:
        has_project_signal = bool(
            re.search(r"\bPROGRAMA/ATIVIDADES DE PD&I\b|\bNOME DA ATIVIDADE DE PD&I\b", text, re.IGNORECASE)
        )
        if has_project_signal:
            projects = [_new_project(1)]

    return projects[:300]
