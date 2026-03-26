import re


GENERIC_HEADERS = {
    "DESCRIÇÃO DO PROJETO:",
    "DESCRICAO DO PROJETO:",
    "CATEGORIA PREDOMINANTE NO PROJETO, CONSIDERANDO AS ATIVIDADES DESENVOLVIDAS",
    "INDICAÇÃO DO NÍVEL DE MATURIDADE TECNOLÓGICA (INICIAL E FINAL) DO PROJETO DE",
    "INDICACAO DO NIVEL DE MATURIDADE TECNOLOGICA (INICIAL E FINAL) DO PROJETO DE",
    "ÁREA (PREDOMINANTE) DO PROJETO DE PD&I:",
    "AREA (PREDOMINANTE) DO PROJETO DE PD&I:",
    "ELEMENTO TECNOLOGICAMENTE NOVO OU INOVADOR DO PROJETO:",
    "PROJETO:",
    "O PROJETO É CONTÍNUO (EXECUTADO POR UM PERÍODO SUPERIOR A UM ANO)?",
    "O PROJETO E CONTINUO (EXECUTADO POR UM PERIODO SUPERIOR A UM ANO)?",
}


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def parse_projects(text: str, profile: str | None = None) -> list[dict]:
    lines = [_clean(ln) for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    projects: list[dict] = []

    marker_patterns = [
        r"ITEM/T[ÍI]TULO DO PROJETO DE PD&I",
        r"ITEM/T[ÍI]TULO DO PROJETO",
    ]
    if profile == "v1_legacy_2017_2018":
        marker_patterns.extend([r"T[ÍI]TULO DO PROJETO", r"PROJETO\s*[:\-]\s*$"])
    marker_re = re.compile("|".join(marker_patterns), re.IGNORECASE)
    desc_re = re.compile(r"DESCRI[CÇ][AÃ]O DO PROJETO", re.IGNORECASE)

    i = 0
    while i < len(lines):
        line = lines[i]
        if marker_re.search(line):
            title = None
            description = None

            # Title candidate from next lines.
            for j in range(i + 1, min(i + 8, len(lines))):
                candidate = lines[j].strip(":- ").strip()
                if not candidate:
                    continue
                if marker_re.search(candidate):
                    break
                if desc_re.search(candidate):
                    continue
                if candidate.upper() in GENERIC_HEADERS:
                    continue
                if len(candidate) < 3:
                    continue
                title = candidate[:500]
                break

            # First description line after "DESCRIÇÃO DO PROJETO".
            for j in range(i + 1, min(i + 20, len(lines))):
                if desc_re.search(lines[j]):
                    for k in range(j + 1, min(j + 8, len(lines))):
                        d = lines[k].strip(":- ").strip()
                        if not d:
                            continue
                        if marker_re.search(d):
                            break
                        if d.upper() in GENERIC_HEADERS:
                            continue
                        description = d[:1500]
                        break
                    break

            idx = len(projects) + 1
            projects.append(
                {
                    "title": title or f"Projeto {idx}",
                    "description": description or "",
                    "category": None,
                    "human_resources": [],
                    "expenses": [],
                    "equipment": [],
                }
            )
        i += 1

    # Fallback: if no explicit item markers were found, infer one project when
    # the document clearly has project/description sections.
    if not projects:
        has_project_signal = bool(re.search(r"\bPROJETO\b", text, re.IGNORECASE))
        has_description_signal = bool(desc_re.search(text))
        if (has_project_signal and has_description_signal) or (
            profile == "v1_legacy_2017_2018" and has_project_signal
        ):
            projects.append(
                {
                    "title": "Projeto 1",
                    "description": "",
                    "category": None,
                    "human_resources": [],
                    "expenses": [],
                    "equipment": [],
                }
            )

    # Prevent huge payloads on very large PDFs.
    return projects[:300]
