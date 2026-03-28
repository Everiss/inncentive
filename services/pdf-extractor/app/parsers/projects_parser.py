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
            "ESPECIFICAR AREA DE CONHECIMENTO",
            "PALAVRAS-CHAVE",
            "NATUREZA",
            "ELEMENTO TECNOLOGICAMENTE",
            "QUAL A BARREIRA",
            "DESCRICAO DA BARREIRA",
            "METODOLOGIA",
            "METODOS UTILIZADOS",
            "DETALHAMENTOS ADICIONAIS",
            "INFORMACOES COMPLEMENTARES",
            "OBJETIVO DO PROJETO",
            "RESULTADO ECONOMICO",
            "RESULTADO DE INOVACAO",
            "OBJETIVOS DE DESENVOLVIMENTO SUSTENTAVEL",
            "JUSTIFICATIVA (ODS)",
            "POLITICAS PUBLICAS NACIONAIS",
            "ITENS DE DISPENDIO",
            "DISPENDIOS DO PROGRAMA",
            "RECURSOS HUMANOS ENVOLVIDOS NO PROJETO",
            "RELACAO DE RECURSOS HUMANOS",
            "RELACAO DOS SERVICOS DE TERCEIROS",
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
        if _norm(ln) in {"NO ANO-BASE:", "INICIAL:", "FINAL:", "PROJETO:"}:
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


def _map_pb_pa_or_de(raw: str | None) -> int | None:
    n = _norm(raw or "")
    if not n:
        return None
    if "PESQUISA BASICA" in n or re.search(r"\bPB\b", n):
        return 1
    if "PESQUISA APLICADA" in n or re.search(r"\bPA\b", n):
        return 2
    if "DESENVOLVIMENTO EXPERIMENTAL" in n or re.search(r"\bDE\b", n):
        return 3
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
        "pb_pa_or_de": None,
        "item_number": idx,
        "nature": None,                        # Produto / Processo / Serviço (all versions)
        "is_continuous": None,
        "tech_area_label": None,
        "knowledge_area": None,                # general area (ÁREA DO PROJETO)
        "specific_area": None,                 # specific sub-area (ESPECIFICAR ÁREA)
        "keywords_1": None,
        "keywords_2": None,
        "keywords_3": None,
        "keywords_4": None,
        "keywords_5": None,
        "innovative_element": None,
        "innovative_challenge": None,
        "methodology": None,
        "additional_info": None,
        "economic_result_objective": None,     # objective stated in the form
        "economic_result_obtained": None,      # result achieved in the base year
        "innovation_result_objective": None,
        "innovation_result_obtained": None,
        "trl_initial": None,
        "trl_final": None,
        "mrl_initial": None,                   # v3_late (2024+)
        "mrl_final": None,
        "strl_initial": None,
        "strl_final": None,
        "trl_justification": None,             # v3_late (2024+)
        "financing_own_pct": None,             # v3: RECURSOS PRÓPRIOS %
        "financing_external_pct": None,        # v3: FINANCIAMENTOS %
        "aligns_public_policy": None,
        "public_policy_ref": None,
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

    def _get_or_create(item: int) -> dict:
        if item not in projects:
            projects[item] = _new_project(item)
        return projects[item]

    for i, raw in enumerate(lines):
        line = _clean(raw)
        if not line:
            continue
        nline = _norm(line)

        # ── Title ──────────────────────────────────────────────────────────
        if title_re.match(line) and (
            "NOME DA ATIVIDADE DE PD&I" in nline or "TITULO DO PROJETO" in nline
        ):
            item = _extract_item_idx(line) or fallback_item
            p = _get_or_create(item)
            next_val = _next_non_empty(lines, i + 1)
            if next_val and not _is_numbered_heading(next_val[0]):
                p["title"] = next_val[0][:500]
            fallback_item = max(fallback_item, item)
            continue

        if not section_re.match(line):
            continue

        item = _extract_item_idx(line) or fallback_item
        p = _get_or_create(item)

        # ── Category ───────────────────────────────────────────────────────
        if "PB, PA OU DE" in nline or "CATEGORIA PREDOMINANTE" in nline:
            next_val = _next_non_empty(lines, i + 1)
            if next_val:
                p["category"] = _map_category(next_val[0])
                p["pb_pa_or_de"] = _map_pb_pa_or_de(next_val[0])
            continue

        # ── Nature ─────────────────────────────────────────────────────────
        if "NATUREZA" in nline and "DA ATIVIDADE" not in nline:
            marked = _extract_marked_option(lines, i + 1)
            if marked:
                p["nature"] = _parse_nature(marked)
            else:
                next_val = _next_non_empty(lines, i + 1)
                if next_val:
                    p["nature"] = _parse_nature(next_val[0])
            continue

        # ── Description ────────────────────────────────────────────────────
        if "DESCRICAO DO PROJETO" in nline:
            desc, _ = _extract_multiline_value(lines, i + 1, max_len=1500)
            if desc:
                p["description"] = desc
            continue

        # ── Innovative element ─────────────────────────────────────────────
        if "ELEMENTO TECNOLOGICAMENTE" in nline or "DESTAQUE O ELEMENTO" in nline:
            val, _ = _extract_multiline_value(lines, i + 1, max_len=4000)
            if val:
                p["innovative_element"] = val
            continue

        # ── Innovative challenge ────────────────────────────────────────────
        if "BARREIRA" in nline or "DESAFIO TECNOLOGICO" in nline:
            val, _ = _extract_multiline_value(lines, i + 1, max_len=4000)
            if val:
                p["innovative_challenge"] = val
            continue

        # ── Methodology ────────────────────────────────────────────────────
        if "METODOLOGIA" in nline or "METODOS UTILIZADOS" in nline:
            val, _ = _extract_multiline_value(lines, i + 1, max_len=4000)
            if val:
                p["methodology"] = val
            continue

        # ── Keywords ───────────────────────────────────────────────────────
        if "PALAVRAS-CHAVE" in nline:
            next_val = _next_non_empty(lines, i + 1)
            if next_val:
                parts = [x.strip() for x in re.split(r"[;,|]", next_val[0]) if x.strip()]
                if not parts:
                    parts = [next_val[0].strip()]
                for k in range(5):
                    p[f"keywords_{k+1}"] = parts[k] if k < len(parts) else None
            continue

        # ── Technical area ─────────────────────────────────────────────────
        if ("AREA PREDOMINANTE" in nline or "AREA DO CONHECIMENTO" in nline) and "PROJETO" not in nline:
            next_val = _next_non_empty(lines, i + 1)
            if next_val and not _is_numbered_heading(next_val[0]):
                p["tech_area_label"] = next_val[0][:200]
                p["knowledge_area"] = next_val[0][:255]
            continue

        if "ESPECIFICAR" in nline and "AREA" in nline:
            next_val = _next_non_empty(lines, i + 1)
            if next_val and not _is_numbered_heading(next_val[0]):
                p["specific_area"] = next_val[0][:500]
            continue

        # ── Continuous activity ────────────────────────────────────────────
        if "ATIVIDADE E CONTINUA" in nline or "PROJETO E CONTINUO" in nline:
            marked = _extract_marked_option(lines, i + 1)
            if marked:
                p["is_continuous"] = _parse_yes_no(marked)
            else:
                next_val = _next_non_empty(lines, i + 1)
                if next_val:
                    p["is_continuous"] = _parse_yes_no(next_val[0])
            continue

        # ── Economic result ────────────────────────────────────────────────
        if "RESULTADO ECONOMICO" in nline:
            val, _ = _extract_multiline_value(lines, i + 1, max_len=4000)
            if val:
                p["economic_result_obtained"] = val
            continue

        # ── Innovation result ──────────────────────────────────────────────
        if "RESULTADO DE INOVACAO" in nline:
            val, _ = _extract_multiline_value(lines, i + 1, max_len=4000)
            if val:
                p["innovation_result_obtained"] = val
            continue

        # ── Additional info ────────────────────────────────────────────────
        if "INFORMACOES COMPLEMENTARES" in nline or "DETALHAMENTOS ADICIONAIS" in nline:
            val, _ = _extract_multiline_value(lines, i + 1, max_len=4000)
            if val:
                p["additional_info"] = val
            continue

    if not projects:
        return []
    return [projects[k] for k in sorted(projects.keys())]


def _parse_nature(raw: str | None) -> str | None:
    """Normalise natureza field to PRODUTO / PROCESSO / SERVICO."""
    n = _norm(raw or "")
    if not n:
        return None
    if "PRODUTO" in n:
        return "PRODUTO"
    if "PROCESSO" in n:
        return "PROCESSO"
    if "SERVI" in n:
        return "SERVICO"
    return raw.strip()[:50] if raw else None


def _extract_trl_scales(block: list[str], block_norm: list[str]) -> dict:
    """
    Extract TRL / MRL / STRL initial and final values from a v3 project block.
    Handles two layouts:
      • Single line: "INICIAL: TRL 4 / MRL 3 / STRL 2"
      • Multi-line:  "INICIAL:"  then next lines contain "TRL N", "MRL N", "STRL N"
    """
    result: dict = {
        "trl_initial": None, "trl_final": None,
        "mrl_initial": None, "mrl_final": None,
        "strl_initial": None, "strl_final": None,
    }

    def _extract_scale(text: str, prefix: str) -> int | None:
        m = re.search(rf"{prefix}\s*(\d+)", text, re.IGNORECASE)
        return int(m.group(1)) if m else None

    for i, ln in enumerate(block_norm):
        if ln == "INICIAL:":
            # Collect next 4 lines (may have TRL / MRL / STRL each on own line)
            window = " ".join(block[i : i + 5])
            result["trl_initial"] = _extract_scale(window, "TRL")
            result["mrl_initial"] = _extract_scale(window, "MRL")
            result["strl_initial"] = _extract_scale(window, "STRL")
        elif ln == "FINAL:":
            window = " ".join(block[i : i + 5])
            result["trl_final"] = _extract_scale(window, "TRL")
            result["mrl_final"] = _extract_scale(window, "MRL")
            result["strl_final"] = _extract_scale(window, "STRL")
        # Inline variant: "INICIAL: TRL 4 / MRL 3" or "FINAL: TRL 7"
        elif "INICIAL" in ln and ("TRL" in ln or "MRL" in ln or "STRL" in ln):
            result["trl_initial"] = _extract_scale(ln, "TRL")
            result["mrl_initial"] = _extract_scale(ln, "MRL")
            result["strl_initial"] = _extract_scale(ln, "STRL")
        elif "FINAL" in ln and ("TRL" in ln or "MRL" in ln or "STRL" in ln):
            result["trl_final"] = _extract_scale(ln, "TRL")
            result["mrl_final"] = _extract_scale(ln, "MRL")
            result["strl_final"] = _extract_scale(ln, "STRL")

    return result


def _extract_financing(block: list[str], block_norm: list[str]) -> tuple[float | None, float | None]:
    """
    Extract RECURSOS PRÓPRIOS % and FINANCIAMENTOS % from a v3 project block.
    Returns (own_pct, external_pct).
    """
    for i, ln in enumerate(block_norm):
        if "RECURSOS PROPRIOS" in ln or "FONTES DE FINANCIAMENTO" in ln:
            # Search current line + next 3 for percentage values
            window = " ".join(block[i : i + 4])
            own_m = re.search(r"RECURSOS\s*PR[OÓ]PRIOS\s*%\s*[:\-]?\s*([0-9]{1,3}(?:[.,]\d+)?)", window, re.IGNORECASE)
            ext_m = re.search(r"FINANCIAMENTOS?\s*%\s*[:\-]?\s*([0-9]{1,3}(?:[.,]\d+)?)", window, re.IGNORECASE)
            own_pct = float(own_m.group(1).replace(",", ".")) if own_m else None
            ext_pct = float(ext_m.group(1).replace(",", ".")) if ext_m else None
            if own_pct is not None or ext_pct is not None:
                return own_pct, ext_pct
    return None, None


def _extract_result_pair(
    block: list[str], block_norm: list[str], label_fragment: str
) -> tuple[str | None, str | None]:
    """
    Extract (objective, obtained) from a RESULTADO block.
    The block typically contains:
      RESULTADO ECONÔMICO / RESULTADO DE INOVAÇÃO
        OBJETIVO DO PROJETO: [text]
        NO ANO-BASE: [text]
    Returns (objective_text, obtained_text).
    """
    start = next((i for i, ln in enumerate(block_norm) if label_fragment in ln), None)
    if start is None:
        return None, None

    objective: str | None = None
    obtained: str | None = None

    # Scan forward up to 20 lines
    for i in range(start + 1, min(len(block_norm), start + 20)):
        ln = block_norm[i]
        if any(stop in ln for stop in ("ITENS DE DISPENDIO", "RECURSOS HUMANOS ENVOLVIDOS", "PROGRAMA/ATIVIDADES")):
            break
        if _is_v3_label_line(block[i]) and i != start + 1:
            break

        if "OBJETIVO DO PROJETO" in ln:
            obj_val = _extract_value_after_label(block, i, max_lines=6)
            if obj_val:
                objective = obj_val[:4000]
        elif "NO ANO-BASE" in ln or "ANO BASE" in ln:
            obt_val = _extract_value_after_label(block, i, max_lines=6)
            if obt_val:
                obtained = obt_val[:4000]

    # Fallback: if no sub-labels found, first value after the main label = obtained
    if objective is None and obtained is None:
        val = _extract_value_after_label(block, start, max_lines=8)
        if val:
            obtained = val[:4000]

    return objective, obtained


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

        def find_idx_contains(*tokens: str) -> int | None:
            return next(
                (
                    i
                    for i, ln in enumerate(block_norm)
                    if all(tok in ln for tok in tokens)
                ),
                None,
            )

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
                item_match = re.match(r"^\s*(\d+)\.\s*", title)
                if item_match:
                    try:
                        p["item_number"] = int(item_match.group(1))
                    except ValueError:
                        pass
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
        p["pb_pa_or_de"] = _map_pb_pa_or_de(cat_val or pb_val)

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

        area_idx = find_idx_contains("AREA", "PROJETO")
        if area_idx is not None:
            area_val = _extract_value_after_label(block, area_idx, max_lines=6)
            if area_val:
                p["tech_area_label"] = area_val[:200]
                p["knowledge_area"] = area_val[:255]   # general area = knowledge_area

        know_idx = find_idx_contains("ESPECIFICAR AREA DE CONHECIMENTO")
        if know_idx is not None:
            know_val = _extract_value_after_label(block, know_idx, max_lines=6)
            if know_val:
                p["specific_area"] = know_val[:500]    # specific sub-area only

        kw_idx = find_idx_contains("PALAVRAS-CHAVE")
        if kw_idx is not None:
            kw_val = _extract_value_after_label(block, kw_idx, max_lines=6)
            if kw_val:
                parts = [x.strip() for x in re.split(r"[;,|]", kw_val) if x.strip()]
                if not parts:
                    parts = [kw_val.strip()]
                for k in range(5):
                    p[f"keywords_{k+1}"] = (parts[k] if k < len(parts) else None)

        inov_el_idx = find_idx_contains("ELEMENTO TECNOLOGICAMENTE")
        if inov_el_idx is not None:
            val = _extract_value_after_label(block, inov_el_idx, max_lines=12)
            if val:
                p["innovative_element"] = val[:4000]

        challenge_idx = find_idx_contains("BARREIRA") or find_idx_contains("DESAFIO TECNOLOGICO")
        if challenge_idx is not None:
            val = _extract_value_after_label(block, challenge_idx, max_lines=12)
            if val:
                p["innovative_challenge"] = val[:4000]

        method_idx = find_idx_contains("METODOLOGIA") or find_idx_contains("METODOS UTILIZADOS")
        if method_idx is not None:
            val = _extract_value_after_label(block, method_idx, max_lines=12)
            if val:
                p["methodology"] = val[:4000]

        add_idx = find_idx_contains("DETALHAMENTOS ADICIONAIS") or find_idx_contains("INFORMACOES COMPLEMENTARES")
        if add_idx is not None:
            val = _extract_value_after_label(block, add_idx, max_lines=10)
            if val:
                p["additional_info"] = val[:4000]

        # nature (Produto / Processo / Serviço) — present in all v3 forms
        nature_idx = find_idx_contains("NATUREZA")
        if nature_idx is not None:
            val = _extract_value_after_label(block, nature_idx, max_lines=4)
            p["nature"] = _parse_nature(val)

        # economic and innovation results — objective vs obtained
        econ_obj, econ_obt = _extract_result_pair(block, block_norm, "RESULTADO ECONOMICO")
        p["economic_result_objective"] = econ_obj
        p["economic_result_obtained"] = econ_obt

        inov_obj, inov_obt = _extract_result_pair(block, block_norm, "RESULTADO DE INOVACAO")
        p["innovation_result_objective"] = inov_obj
        p["innovation_result_obtained"] = inov_obt

        # public policy alignment
        policy_idx = find_idx_contains("ALINHAM COM AS POLITICAS PUBLICAS NACIONAIS")
        if policy_idx is not None:
            val = _extract_value_after_label(block, policy_idx, max_lines=4)
            p["aligns_public_policy"] = _parse_yes_no(val)
            if val:
                cleaned = val.strip()
                m_bool = re.match(r"^(sim|nao|não)\b", cleaned, re.IGNORECASE)
                p["public_policy_ref"] = (m_bool.group(0) if m_bool else cleaned)[:500]
            else:
                p["public_policy_ref"] = None

        # TRL / MRL / STRL scales
        scales = _extract_trl_scales(block, block_norm)
        p.update(scales)

        # TRL justification (v3_late AB2024+)
        trl_just_idx = next(
            (i for i, ln in enumerate(block_norm) if "JUSTIFIQUE" in ln and "MATURIDADE" in ln),
            None,
        )
        if trl_just_idx is not None:
            val = _extract_value_after_label(block, trl_just_idx, max_lines=12)
            if val:
                p["trl_justification"] = val[:4000]

        # Financing sources (RECURSOS PRÓPRIOS % / FINANCIAMENTOS %)
        own_pct, ext_pct = _extract_financing(block, block_norm)
        p["financing_own_pct"] = own_pct
        p["financing_external_pct"] = ext_pct

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
