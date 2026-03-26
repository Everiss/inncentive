import re
import unicodedata


def _strip_accents(value: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", value or "") if unicodedata.category(ch) != "Mn"
    )


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", _strip_accents((value or "").upper())).strip()


def _is_noise_line(line: str) -> bool:
    n = _norm(line)
    if not n:
        return True
    noise_markers = (
        "MINISTERIO DA CIENCIA",
        "GERADO EM",
        "PAGINA:",
        "OBSERVACOES:",
        "APRESENTACAO:",
        "ORIENTACOES",
    )
    return any(m in n for m in noise_markers)


def _extract_marked_option(lines: list[str], start_idx: int, max_lookahead: int = 8) -> str | None:
    option_re = re.compile(r"^\(\s*([OX])\s*\)\s*(.+)$", re.IGNORECASE)
    for j in range(start_idx, min(len(lines), start_idx + max_lookahead)):
        line = lines[j].strip()
        if not line:
            continue
        m = option_re.match(line)
        if m and m.group(1).upper() == "O":
            return m.group(2).strip()
    return None


def _pick_value_for_question(
    question: str,
    lines: list[str],
    i: int,
    numbered_item_re: re.Pattern[str],
) -> tuple[str, int]:
    q_norm = _norm(question)

    # Legacy layouts (2017/2018/2021) use "( O ) Option" lines
    # only for choice-based questions.
    choice_question = any(
        key in q_norm
        for key in (
            "TIPO DE ORGANISMO",
            "TIPO DE EMPRESA",
            "SITUACAO DA EMPRESA",
            "BENEFICIA DOS INCENTIVOS",
            "ORIGEM DO CAPITAL CONTROLADOR",
            "RELACAO COM O GRUPO",
            "FECHOU COM PREJUIZO FISCAL",
            "FECHOU O ANO-BASE COM PREJUIZO FISCAL",
        )
    )
    if choice_question:
        marked = _extract_marked_option(lines, i + 1)
        if marked:
            return marked, i

    max_lookahead = 16
    for j in range(i + 1, min(len(lines), i + 1 + max_lookahead)):
        nxt = lines[j].strip()
        if not nxt:
            continue
        if "?" in nxt or numbered_item_re.match(nxt):
            break
        if _is_noise_line(nxt):
            continue

        # Employee count: ignore noisy text and keep first numeric answer.
        if "NUMERO TOTAL DE FUNCIONARIOS" in q_norm or "TOTAL DE FUNCIONARIOS COM VINCULO" in q_norm:
            if re.match(r"^\d{1,7}$", nxt):
                return nxt, j
            continue

        # Revenue values are often represented as plain numeric/currency lines.
        if "RECEITA" in q_norm:
            if re.match(r"^(?:R\$\s*)?\d[\d\.\,]*$", nxt, re.IGNORECASE):
                return nxt, j
            continue

        if _is_section_header(nxt):
            break

        return nxt, j

    return "", i


def _extract_block(text: str) -> list[str]:
    lines = [ln.strip() for ln in text.splitlines()]
    start_idx = None
    end_idx = len(lines)

    for i, ln in enumerate(lines):
        nln = _norm(ln)
        if (
            "IDENTIFICACAO/CARACTERISTICAS DA EMPRESA" in nln
            or "IDENTIFICACAO CARACTERISTICAS DA EMPRESA" in nln
            or "IDENTIFICACAOCARACTERISTICAS DA EMPRESA" in nln
            or ("IDENTIFICACAO" in nln and "CARACTERISTICAS DA EMPRESA" in nln)
            or nln.startswith("1. IDENTIFICACAO DA EMPRESA")
            or nln.startswith("1 IDENTIFICACAO DA EMPRESA")
        ):
            start_idx = i + 1
            break

    if start_idx is None:
        return []

    end_markers = (
        "PROGRAMA/ATIVIDADE DE PD&I",
        "PROGRAMA/ATIVIDADE DE PD I",
        "3. PROGRAMA/ATIVIDADES DE PD&I",
        "3 PROGRAMA/ATIVIDADES DE PD&I",
        "ITEM/TITULO DO PROJETO",
    )
    for j in range(start_idx, len(lines)):
        nln = _norm(lines[j])
        if any(marker in nln for marker in end_markers):
            end_idx = j
            break

    return [ln for ln in lines[start_idx:end_idx] if ln]


def _is_section_header(line: str) -> bool:
    nln = _norm(line)
    if not nln:
        return True
    if "?" in line or ":" in line:
        return False
    numbered = re.sub(r"^\d+(?:\.\d+){0,3}\.?\s*", "", line or "").strip()
    if numbered and len(numbered) >= 8 and numbered.upper() == numbered:
        return True
    for marker in (
        "IDENTIFICACAO DA EMPRESA",
        "CARACTERISTICAS DA EMPRESA",
        "DADOS PESSOA JURIDICA",
        "DADOS PESSOA",
    ):
        if marker in nln:
            return True
    return False


def _map_field_key(question: str) -> str:
    q = _norm(question)
    if "TIPO DE EMPRESA" in q or "TIPO DE ORGANISMO" in q:
        return "company_type"
    if "SITUACAO DA EMPRESA" in q:
        return "company_status"
    if "LEI 11.196" in q or "8248/1991" in q or "BENEFICIA DOS INCENTIVOS" in q:
        return "benefits_law_11196_8248"
    if "ORIGEM DO CAPITAL CONTROLADOR" in q:
        return "capital_origin"
    if "RELACAO DA EMPRESA COM O GRUPO" in q or "RELACAO COM O GRUPO" in q:
        return "group_relationship"
    if "RECEITA OPERACIONAL BRUTA ANUAL" in q:
        return "gross_operational_revenue"
    if "RECEITA LIQUIDA" in q:
        return "net_revenue"
    if "TOTAL DE FUNCIONARIOS COM VINCULO" in q:
        return "employee_count_with_contract"
    if (
        "FECHOU O ANO-BASE COM PREJUIZO FISCAL" in q
        or "FECHOU COM PREJUIZO FISCAL" in q
        or "FECHOU EM PREJUIZO FISCAL" in q
    ):
        return "closed_year_with_tax_loss"
    if "FORMA DE APURACAO DO IRPJ E DA CSLL" in q:
        return "irpj_csll_apportionment"
    if "SE FOR USUFRUIR DOS INCENTIVOS FISCAIS" in q:
        return "incentives_reason"
    if "ESTRUTURA ORGANIZACIONAL DE P&D" in q:
        return "rnd_organizational_structure"
    return ""


def parse_company_identification(text: str) -> dict:
    block_lines = _extract_block(text)
    if not block_lines:
        return {"fields": {}, "qa": [], "raw_text": ""}

    qa: list[dict[str, str]] = []
    i = 0
    numbered_item_re = re.compile(r"^\d+(?:\.\d+){1,3}\.?\s+(.+)$")

    while i < len(block_lines):
        line = block_lines[i].strip()
        if not line or _is_section_header(line):
            i += 1
            continue

        question = ""
        value = ""

        if "?" in line:
            q_part, v_part = line.split("?", 1)
            question = (q_part.strip() + "?").strip()
            value = v_part.strip()
        else:
            # Wrapped question without numbering.
            if (
                i + 1 < len(block_lines)
                and "?" not in line
                and "?" in block_lines[i + 1]
                and ":" not in line
                and not numbered_item_re.match(line)
            ):
                merged = f"{line} {block_lines[i + 1].strip()}".strip()
                q_part, v_part = merged.split("?", 1)
                question = (q_part.strip() + "?").strip()
                value = v_part.strip()
                i += 1

            m = numbered_item_re.match(line) if not question else None
            if m:
                question = m.group(1).strip()
                j = i + 1
                while j < len(block_lines):
                    nxt = block_lines[j].strip()
                    if not nxt:
                        j += 1
                        continue
                    if numbered_item_re.match(nxt) or _is_section_header(nxt):
                        break
                    if nxt[0].islower() or "?" in nxt:
                        question = f"{question} {nxt}".strip()
                        i = j
                        if "?" in nxt:
                            break
                        j += 1
                        continue
                    break
            elif ":" in line and not question:
                q_part, v_part = line.split(":", 1)
                question = q_part.strip()
                value = v_part.strip()

        if question:
            q_norm = _norm(question)
            is_long = (
                "SE FOR USUFRUIR DOS INCENTIVOS FISCAIS" in q_norm
                or "ESTRUTURA ORGANIZACIONAL DE P&D" in q_norm
                or "ESTRUTURA ORGANIZACIONAL DE PD" in q_norm
            )

            if not value:
                picked, consumed_idx = _pick_value_for_question(question, block_lines, i, numbered_item_re)
                if picked:
                    value = picked
                    i = max(i, consumed_idx)

            if is_long:
                buffer = [value] if value else []
                j = i + 1
                while j < len(block_lines):
                    nxt = block_lines[j].strip()
                    if not nxt:
                        j += 1
                        continue
                    if "?" in nxt or numbered_item_re.match(nxt):
                        break
                    if _is_section_header(nxt):
                        break
                    if _is_noise_line(nxt):
                        j += 1
                        continue
                    buffer.append(nxt)
                    j += 1
                value = " ".join(v for v in buffer if v).strip()
                i = j - 1

            qa.append({"question": question, "value": value})

        i += 1

    fields: dict[str, str] = {}
    for item in qa:
        key = _map_field_key(item["question"])
        if key and item["value"]:
            fields[key] = item["value"]

    return {
        "fields": fields,
        "qa": qa,
        "raw_text": "\n".join(block_lines),
    }
