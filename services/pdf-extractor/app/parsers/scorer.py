"""
scorer.py
---------
Engine de scoring de acurácia da extração FORMPD.

Fórmula:
    score = 0.40 * completeness + 0.30 * confidence + 0.30 * cross_validation

Onde:
    completeness    — % dos campos obrigatórios Lei do Bem encontrados
    confidence      — média de confiança dos campos extraídos (estimada)
    cross_validation — % das regras CV aprovadas

Limiares:
    score >= 0.85 → HIGH   — não precisa de IA
    0.60 <= score < 0.85 → MEDIUM — IA para campos específicos
    score < 0.60 → LOW   — IA full reextraction recomendada
"""

import re
from typing import Any


# ---------------------------------------------------------------------------
# Mandatory fields by profile
# ---------------------------------------------------------------------------

_MANDATORY: dict[str, list[str]] = {
    "v1_2017": [
        "cnpj",
        "fiscal_year",
        "projects.title",
        "projects.category",
    ],
    "v1_2018": [
        "cnpj",
        "fiscal_year",
        "projects.title",
        "projects.category",
        "projects.innovative_element",
    ],
    "v2_early": [
        "cnpj",
        "fiscal_year",
        "submission_receipt.sender_name",
        "submission_receipt.sender_cpf",
        "submission_receipt.authenticity_code",
        "projects.title",
        "projects.category",
        "projects.innovative_element",
        "projects.human_resources",
    ],
    "v2_late": [
        "cnpj",
        "fiscal_year",
        "submission_receipt.sender_name",
        "submission_receipt.sender_cpf",
        "submission_receipt.authenticity_code",
        "projects.title",
        "projects.category",
        "projects.human_resources",
        "projects.expenses",
        "projects.economic_result_obtained",
    ],
    "v3_early": [
        "cnpj",
        "fiscal_year",
        "submission_receipt.sender_name",
        "submission_receipt.sender_cpf",
        "submission_receipt.authenticity_code",
        "projects.title",
        "projects.category",
        "projects.methodology",
        "projects.trl_initial",
        "projects.human_resources",
    ],
    "v3_late": [
        "cnpj",
        "fiscal_year",
        "submission_receipt.sender_name",
        "submission_receipt.sender_cpf",
        "submission_receipt.authenticity_code",
        "projects.title",
        "projects.category",
        "projects.methodology",
        "projects.trl_initial",
        "projects.trl_justification",
        "projects.human_resources",
    ],
}

# Default to v2_early when profile is unknown
_MANDATORY_DEFAULT = _MANDATORY["v2_early"]


# ---------------------------------------------------------------------------
# Field presence helpers
# ---------------------------------------------------------------------------

def _present(value: Any) -> bool:
    """Return True if the value is considered present (non-null, non-empty)."""
    if value is None:
        return False
    if isinstance(value, (list, dict)):
        return bool(value)
    if isinstance(value, str):
        return bool(value.strip())
    return True


def _cnpj_checksum_valid(cnpj_raw: str | None) -> bool:
    """Validate CNPJ using LMU algorithm."""
    if not cnpj_raw:
        return False
    digits = re.sub(r"\D", "", str(cnpj_raw))
    if len(digits) != 14:
        return False
    if len(set(digits)) == 1:
        return False  # all same digit

    def _calc(d: str, weights: list[int]) -> int:
        total = sum(int(c) * w for c, w in zip(d, weights))
        rem = total % 11
        return 0 if rem < 2 else 11 - rem

    w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    d1 = _calc(digits[:12], w1)
    d2 = _calc(digits[:13], w2)
    return int(digits[12]) == d1 and int(digits[13]) == d2


def _sum_amounts(items: list[dict], key: str = "annual_amount") -> float:
    total = 0.0
    for item in items or []:
        v = item.get(key) if isinstance(item, dict) else None
        if v is not None:
            try:
                total += float(v)
            except (TypeError, ValueError):
                pass
    return total


# ---------------------------------------------------------------------------
# Completeness check
# ---------------------------------------------------------------------------

def _check_completeness(payload: dict, profile: str) -> tuple[float, list[str]]:
    """
    Return (completeness_ratio 0.0–1.0, list_of_missing_mandatory_fields).
    """
    mandatory = _MANDATORY.get(profile, _MANDATORY_DEFAULT)
    form_data = payload.get("form_data") or {}
    receipt = payload.get("submission_receipt") or form_data.get("submission_receipt") or {}
    projects = form_data.get("projects") or []

    missing: list[str] = []

    for field in mandatory:
        if field == "cnpj":
            if not _present(payload.get("cnpj_from_form")):
                missing.append(field)
        elif field == "fiscal_year":
            if not _present(payload.get("fiscal_year")):
                missing.append(field)
        elif field.startswith("submission_receipt."):
            sub_key = field.split(".", 1)[1]
            if not _present(receipt.get(sub_key)):
                missing.append(field)
        elif field.startswith("projects."):
            proj_key = field.split(".", 1)[1]
            # Consider satisfied if ANY project has the field
            found = any(_present(p.get(proj_key)) for p in projects)
            if not found:
                missing.append(field)

    found_count = len(mandatory) - len(missing)
    ratio = found_count / len(mandatory) if mandatory else 1.0
    return ratio, missing


# ---------------------------------------------------------------------------
# Confidence estimation
# ---------------------------------------------------------------------------

# Fields with higher extraction reliability (regex-anchored patterns)
_HIGH_CONF_FIELDS = {
    "cnpj_from_form",
    "fiscal_year",
    "submission_receipt.sender_cpf",
    "submission_receipt.authenticity_code",
    "submission_receipt.expedition_at",
}

_MEDIUM_CONF_FIELDS = {
    "submission_receipt.sender_name",
    "company_name",
    "projects.title",
    "projects.category",
    "projects.trl_initial",
    "projects.trl_final",
    "projects.human_resources",
    "projects.expenses",
}


def _estimate_confidence(payload: dict, profile: str) -> float:
    """
    Estimate average confidence (0.0–1.0) based on which fields are present
    and their expected extraction reliability.
    """
    form_data = payload.get("form_data") or {}
    receipt = payload.get("submission_receipt") or form_data.get("submission_receipt") or {}
    projects = form_data.get("projects") or []

    scores: list[float] = []

    # High-confidence fields
    for f in _HIGH_CONF_FIELDS:
        if "." in f:
            ns, key = f.split(".", 1)
            val = receipt.get(key) if ns == "submission_receipt" else None
        else:
            val = payload.get(f)
        scores.append(1.0 if _present(val) else 0.0)

    # Medium-confidence fields (present = 0.75, absent = 0.0)
    for f in _MEDIUM_CONF_FIELDS:
        if f.startswith("projects."):
            key = f.split(".", 1)[1]
            val = any(_present(p.get(key)) for p in projects)
            scores.append(0.75 if val else 0.0)
        elif "." in f:
            ns, key = f.split(".", 1)
            val = receipt.get(key) if ns == "submission_receipt" else None
            scores.append(0.75 if _present(val) else 0.0)
        else:
            scores.append(0.75 if _present(payload.get(f)) else 0.0)

    # Narrative fields (lower confidence but presence = 0.6)
    narrative_keys = ["methodology", "innovative_element", "description"]
    for p in projects:
        for key in narrative_keys:
            scores.append(0.6 if _present(p.get(key)) else 0.0)
        break  # only first project to keep weight balanced

    return sum(scores) / len(scores) if scores else 0.0


# ---------------------------------------------------------------------------
# Cross-validation rules
# ---------------------------------------------------------------------------

def _run_cross_validations(
    payload: dict,
    profile: str,
    summary_table: dict | None = None,
) -> tuple[float, dict[str, bool | None]]:
    """
    Run all CV rules. Returns (ratio_passed 0.0–1.0, {rule_id: result_or_None}).
    None = rule not applicable for this profile.
    """
    form_data = payload.get("form_data") or {}
    receipt = payload.get("submission_receipt") or form_data.get("submission_receipt") or {}
    projects = form_data.get("projects") or []
    cnpj = payload.get("cnpj_from_form")
    fiscal_year = payload.get("fiscal_year")

    results: dict[str, bool | None] = {}

    # CV-01: CNPJ checksum
    results["CV-01"] = _cnpj_checksum_valid(cnpj)

    # CV-02: fiscal_year sanity (2005–2030)
    if fiscal_year is not None:
        try:
            yr = int(str(fiscal_year).strip()[:4])
            results["CV-02"] = 2005 <= yr <= 2030
        except (ValueError, TypeError):
            results["CV-02"] = False
    else:
        results["CV-02"] = False

    # CV-03: sum(hr.annual_amount) ≈ any stated total_rh (if available)
    # We check that at least one project has HR records when HR is mandatory
    has_receipt = profile in ("v2_early", "v2_late", "v3_early", "v3_late")
    receipt_ok = all(
        _present(receipt.get(k))
        for k in ("sender_name", "sender_cpf", "authenticity_code")
    )
    if has_receipt:
        results["CV-03"] = receipt_ok
    else:
        results["CV-03"] = None  # not applicable for v1

    # CV-04: at least one project has expenses if not v1
    if profile in ("v2_late", "v3_early", "v3_late"):
        has_expenses = any(_present(p.get("expenses")) for p in projects)
        results["CV-04"] = has_expenses
    else:
        results["CV-04"] = None

    # CV-05: project_count_summary == len(projects) — v3 only
    if summary_table and summary_table.get("found") and profile in ("v3_early", "v3_late"):
        declared = summary_table.get("project_count") or 0
        extracted = len(projects)
        results["CV-05"] = declared > 0 and declared == extracted
    else:
        results["CV-05"] = None

    # CV-06: declared_total ≈ sum of extracted project expense totals — v3 only
    if summary_table and summary_table.get("declared_total") and profile in ("v3_early", "v3_late"):
        declared = float(summary_table["declared_total"])
        extracted = sum(
            _sum_amounts(p.get("expenses") or [], "amount")
            for p in projects
        )
        if declared > 0 and extracted > 0:
            results["CV-06"] = abs(extracted - declared) / declared < 0.10  # 10% tolerance
        else:
            results["CV-06"] = None
    else:
        results["CV-06"] = None

    # CV-07: authenticity_code format
    auth_code = receipt.get("authenticity_code") or ""
    if auth_code:
        # v2: 25-digit string / v3: UUID-like with dashes
        is_uuid_like = bool(re.match(r"[A-Za-z0-9]{8}-[A-Za-z0-9]{4}-", auth_code))
        is_numeric = bool(re.match(r"^\d{20,30}$", auth_code))
        results["CV-07"] = is_uuid_like or is_numeric
    elif profile in ("v2_early", "v2_late", "v3_early", "v3_late"):
        results["CV-07"] = False
    else:
        results["CV-07"] = None

    # CV-08: has HR records if profile requires it
    if profile in ("v2_early", "v2_late", "v3_early", "v3_late"):
        results["CV-08"] = any(_present(p.get("human_resources")) for p in projects)
    else:
        results["CV-08"] = None

    # CV-09: category value is valid MCTI category
    _VALID_CATEGORIES = {"PESQUISA_BASICA", "PESQUISA_APLICADA", "DESENVOLVIMENTO_EXPERIMENTAL", "INOVACAO_TECNOLOGICA"}
    categories_ok = all(
        (p.get("category") or "").upper() in _VALID_CATEGORIES
        for p in projects
        if _present(p.get("category"))
    )
    results["CV-09"] = categories_ok if projects else False

    # Count applicable rules
    applicable = [v for v in results.values() if v is not None]
    if not applicable:
        return 0.5, results  # no rules applicable → neutral

    passed = sum(1 for v in applicable if v)
    return passed / len(applicable), results


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_SCORE_WEIGHTS = {"completeness": 0.40, "confidence": 0.30, "cross_validation": 0.30}


def compute_score(
    payload: dict,
    version_info: dict,
    summary_table: dict | None = None,
) -> dict:
    """
    Compute extraction accuracy score for a FORMPD extraction result.

    Args:
        payload:        The full extraction payload (same structure as ExtractResponse).
        version_info:   Output of detect_formpd_version().
        summary_table:  Output of parse_summary_table() (optional, used for CV-05/06).

    Returns:
        {
            "overall_score":        float (0.0–1.0),
            "score_pct":            float (0–100),
            "score_band":           "HIGH" | "MEDIUM" | "LOW",
            "completeness":         float,
            "confidence":           float,
            "cross_validation":     float,
            "missing_mandatory":    list[str],
            "cv_results":           dict[str, bool | None],
            "needs_ai":             bool,
            "ai_priority_fields":   list[str],
            "profile":              str,
        }
    """
    profile = version_info.get("profile") or version_info.get("family", "v2_early")
    # Normalise coarse family to a known profile
    if profile not in _MANDATORY:
        _FAMILY_TO_PROFILE = {
            "v1_legacy_2017_2018":       "v1_2018",
            "v2_intermediate_2019_2022": "v2_late",
            "v3_modern_2023_plus":       "v3_early",
        }
        profile = _FAMILY_TO_PROFILE.get(profile, "v2_late")

    completeness, missing = _check_completeness(payload, profile)
    confidence = _estimate_confidence(payload, profile)
    cv_ratio, cv_results = _run_cross_validations(payload, profile, summary_table)

    overall = (
        _SCORE_WEIGHTS["completeness"] * completeness
        + _SCORE_WEIGHTS["confidence"] * confidence
        + _SCORE_WEIGHTS["cross_validation"] * cv_ratio
    )

    if overall >= 0.85:
        band = "HIGH"
        needs_ai = False
    elif overall >= 0.60:
        band = "MEDIUM"
        needs_ai = bool(missing)
    else:
        band = "LOW"
        needs_ai = True

    # Prioritise missing fields for AI
    _HIGH_PRIORITY = {
        "cnpj", "fiscal_year",
        "submission_receipt.sender_name", "submission_receipt.sender_cpf",
        "submission_receipt.authenticity_code",
    }
    ai_priority = sorted(
        missing,
        key=lambda f: (0 if f in _HIGH_PRIORITY else 1, f),
    )

    return {
        "overall_score": round(overall, 4),
        "score_pct": round(overall * 100, 2),
        "score_band": band,
        "completeness": round(completeness, 4),
        "confidence": round(confidence, 4),
        "cross_validation": round(cv_ratio, 4),
        "missing_mandatory": missing,
        "cv_results": cv_results,
        "needs_ai": needs_ai,
        "ai_priority_fields": ai_priority,
        "profile": profile,
    }
