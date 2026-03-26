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


def detect_formpd_version(text: str) -> dict:
    ntext = _normalize(text)

    signals = {
        "receipt_block": _has(ntext, r"RECIBO DE ENTREGA"),
        "dados_empresa_block": _has(ntext, r"DADOS DA EMPRESA"),
        "dados_remetente_block": _has(ntext, r"DADOS DO REMETENTE"),
        "authenticity_code": _has(ntext, r"CODIGO DE AUTENTICIDADE"),
        "ano_base": _has(ntext, r"ANO BASE"),
        "project_item_marker": _has(ntext, r"ITEM/TITULO DO PROJETO DE PD&I|ITEM/TITULO DO PROJETO"),
        "project_generic_marker": _has(ntext, r"\bPROJETO(S)?\b"),
        "resources_marker": _has(ntext, r"RECURSOS HUMANOS"),
        "expenses_marker": _has(ntext, r"\bDESPESAS\b"),
        "equipment_marker": _has(ntext, r"\bEQUIPAMENTOS\b"),
    }
    signal_count = sum(1 for v in signals.values() if v)

    year_match = re.search(r"ANO BASE\s*[:\-]?\s*(20\d{2})", ntext)
    year_hint = int(year_match.group(1)) if year_match else None

    # Version families observed from historical samples.
    if signals["receipt_block"] and signals["dados_remetente_block"] and signals["authenticity_code"]:
        if signals["dados_empresa_block"]:
            family = "v3_modern_2023_plus"
        else:
            family = "v2_intermediate_2019_2022"
    elif signals["project_generic_marker"] and signals["ano_base"]:
        family = "v1_legacy_2017_2018"
    else:
        family = "v2_intermediate_2019_2022"

    return {
        "family": family,
        "year_hint": year_hint,
        "signal_count": signal_count,
        "signals": signals,
        # Canonical superset schema for persistence, based on the most complete modern versions.
        "schema_profile": "formpd_superset_v3",
    }

