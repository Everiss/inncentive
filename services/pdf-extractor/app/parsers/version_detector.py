import re
import unicodedata


def _normalize(text: str) -> str:
    if not text:
        return ""
    upper = text.upper()
    no_accents = "".join(
        ch for ch in unicodedata.normalize("NFD", upper) if unicodedata.category(ch) != "Mn"
    )
    return re.sub(r"\s+", " ", no_accents)


def _has(text: str, pattern: str) -> bool:
    return bool(re.search(pattern, text, re.IGNORECASE))


# ---------------------------------------------------------------------------
# Individual signal detectors
# ---------------------------------------------------------------------------

def _signals(ntext: str) -> dict[str, bool]:
    return {
        # Receipt / recibo
        "receipt_block":          _has(ntext, r"RECIBO DE ENTREGA"),
        "dados_remetente":        _has(ntext, r"DADOS DO REMETENTE"),
        "dados_empresa":          _has(ntext, r"DADOS DA EMPRESA"),
        "dados_pessoa_juridica":  _has(ntext, r"DADOS PESSOA JURIDICA"),
        "authenticity_code":      _has(ntext, r"CODIGO DE AUTENTICIDADE"),
        # Project markers
        "programa_atividades":    _has(ntext, r"PROGRAMA/ATIVIDADES DE PD&I\s*-\s*\d"),
        "item_nome_atividade":    _has(ntext, r"ITEM/NOME DA ATIVIDADE DE PD&I"),
        "item_titulo_projeto":    _has(ntext, r"ITEM/TITULO DO PROJETO DE PD&I"),
        # [Item N] section markers (v2_late / v2 with multiple projects)
        "item_bracket":           _has(ntext, r"\[ITEM\s*\d+\]"),
        # Numbered section structure (v1 / v2)
        "numbered_3_1":           _has(ntext, r"^3\.1\.\d+\.", ),
        # Radio-button choices — v1 only
        "radio_buttons":          _has(ntext, r"\(\s*O\s*\)"),
        # v3_late exclusive signals (AB2024+)
        "trl_justification":      _has(ntext, r"JUSTIFIQUE\b.{0,60}MATURIDADE"),
        "mrl_scale":              _has(ntext, r"\bMRL\s*\d"),
        "qual_tipo_empresa":      _has(ntext, r"QUAL E O TIPO DE EMPRESA"),
        "receita_bruta":          _has(ntext, r"RECEITA OPERACIONAL BRUTA"),
        # v3_early exclusive signals
        "uuid_auth_code":         _has(ntext, r"CODIGO DE AUTENTICIDADE\s*[:\-]?\s*[A-Z0-9]{8}-[A-Z0-9]{4}"),
        # Common presence checks
        "ano_base":               _has(ntext, r"ANO BASE"),
        "recursos_humanos":       _has(ntext, r"RECURSOS HUMANOS"),
        "dispendios":             _has(ntext, r"ITENS DE DISPENDIO"),
    }


def _extract_year_hint(ntext: str) -> int | None:
    m = re.search(r"ANO BASE\s*[:\-]?\s*(20\d{2})", ntext)
    if m:
        return int(m.group(1))
    # AB2017 edge case: "2.017" format
    m = re.search(r"ANO BASE\s*[:\-]?\s*2[\.\s](\d{3})\b", ntext)
    if m:
        try:
            return int(f"2{m.group(1)}")
        except ValueError:
            pass
    return None


# ---------------------------------------------------------------------------
# Profile routing
# ---------------------------------------------------------------------------

def _route_profile(s: dict[str, bool], year: int | None) -> str:
    """
    Determine the 6-profile family from signals + year hint.
    Priority order: most specific first.
    """

    # ── v3 branch (has PROGRAMA/ATIVIDADES - N blocks) ──────────────────────
    if s["programa_atividades"] or s["dados_empresa"]:
        # v3_late: exclusive AB2024+ signals
        if s["item_titulo_projeto"] or s["trl_justification"] or s["mrl_scale"] or s["receita_bruta"]:
            return "v3_late"
        # v3_late by year
        if year is not None and year >= 2024:
            return "v3_late"
        # v3_early (2023)
        return "v3_early"

    # ── v2 branch (has RECIBO DE ENTREGA, no PROGRAMA/ATIVIDADES blocks) ────
    if s["receipt_block"]:
        # v2_late: [Item N] markers present (multiple projects, 2022)
        if s["item_bracket"]:
            return "v2_late"
        # v2_late by year
        if year is not None and year >= 2022:
            return "v2_late"
        # v2_early (2019–2021)
        return "v2_early"

    # ── v1 branch (no receipt block) ────────────────────────────────────────
    # v1_2018: has DADOS PESSOA JURIDICA block
    if s["dados_pessoa_juridica"] or s["dados_empresa"]:
        return "v1_2018"
    # v1_2017: classic radio buttons
    if s["radio_buttons"]:
        return "v1_2017"

    # ── Year-based tiebreakers ───────────────────────────────────────────────
    if year is not None:
        if year >= 2024:
            return "v3_late"
        if year == 2023:
            return "v3_early"
        if year == 2022:
            return "v2_late"
        if 2019 <= year <= 2021:
            return "v2_early"
        if year == 2018:
            return "v1_2018"
        if year <= 2017:
            return "v1_2017"

    # ── Default ──────────────────────────────────────────────────────────────
    # Fallback: numbered 3.1. structure = v2_early; otherwise unknown → v2_early
    return "v2_early"


# ---------------------------------------------------------------------------
# Backwards-compatible family mapping
# ---------------------------------------------------------------------------

_COMPAT_FAMILY = {
    "v1_2017":   "v1_legacy_2017_2018",
    "v1_2018":   "v1_legacy_2017_2018",
    "v2_early":  "v2_intermediate_2019_2022",
    "v2_late":   "v2_intermediate_2019_2022",
    "v3_early":  "v3_modern_2023_plus",
    "v3_late":   "v3_modern_2023_plus",
}

# Dispatcher families used by parsers (hr, expenses, projects)
_PARSER_FAMILY = {
    "v1_2017":   "v1_legacy_2017_2018",
    "v1_2018":   "v1_legacy_2017_2018",
    "v2_early":  "v2_intermediate_2019_2022",
    "v2_late":   "v2_intermediate_2019_2022",
    "v3_early":  "v3_modern_2023_plus",
    "v3_late":   "v3_modern_2023_plus",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_formpd_version(text: str) -> dict:
    """
    Detect FORMPD form version from extracted text.

    Returns:
        family          — coarse 3-value family for parser dispatch
                          (v1_legacy_2017_2018 | v2_intermediate_2019_2022 | v3_modern_2023_plus)
        profile         — granular 6-value profile for scoring / validation
                          (v1_2017 | v1_2018 | v2_early | v2_late | v3_early | v3_late)
        year_hint       — fiscal year extracted from text, or None
        signal_count    — number of positive signals
        signals         — full signal dict for debugging
        schema_profile  — always "formpd_superset_v3" (canonical persistence schema)
    """
    ntext = _normalize(text)
    s = _signals(ntext)
    year_hint = _extract_year_hint(ntext)
    signal_count = sum(1 for v in s.values() if v)

    profile = _route_profile(s, year_hint)
    family = _PARSER_FAMILY[profile]

    return {
        "family": family,           # used by all parsers for dispatch
        "profile": profile,         # granular — used by scorer / validator
        "year_hint": year_hint,
        "signal_count": signal_count,
        "signals": s,
        "schema_profile": "formpd_superset_v3",
    }
