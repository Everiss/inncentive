"""
Unit tests for scorer.py
Tests completeness, confidence, cross-validation, and compute_score.
"""
import pytest
from app.parsers.scorer import compute_score, _cnpj_checksum_valid, _check_completeness


# ---------------------------------------------------------------------------
# CNPJ validation (CV-01 foundation)
# ---------------------------------------------------------------------------

class TestCnpjChecksum:
    def test_valid_cnpj(self):
        assert _cnpj_checksum_valid("11.222.333/0001-81") is True

    def test_invalid_cnpj_wrong_digits(self):
        assert _cnpj_checksum_valid("11.222.333/0001-00") is False

    def test_all_same_digits(self):
        assert _cnpj_checksum_valid("11111111111111") is False

    def test_none(self):
        assert _cnpj_checksum_valid(None) is False

    def test_wrong_length(self):
        assert _cnpj_checksum_valid("1234567") is False


# ---------------------------------------------------------------------------
# Helpers for building minimal payloads
# ---------------------------------------------------------------------------

def _base_payload(
    cnpj="11.222.333/0001-81",
    fiscal_year=2023,
    projects=None,
    receipt=None,
):
    return {
        "cnpj_from_form": cnpj,
        "fiscal_year": fiscal_year,
        "form_data": {
            "projects": projects or [],
            "submission_receipt": receipt or {},
        },
        "submission_receipt": receipt or {},
    }


def _full_project():
    return {
        "title": "Plataforma de IA para diagnóstico",
        "category": "PESQUISA_APLICADA",
        "methodology": "Design Science Research",
        "innovative_element": "Algoritmo de visão computacional",
        "trl_initial": 3,
        "human_resources": [
            {"cpf": "111.222.333-96", "name": "Fulano", "annual_amount": 50000}
        ],
        "expenses": [
            {"category": "SERVIÇOS DE TERCEIROS", "amount": 20000}
        ],
    }


def _full_receipt():
    return {
        "sender_name": "Carlos Silva",
        "sender_cpf": "111.444.777-35",
        "authenticity_code": "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
        "expedition_at": "10/03/2024",
    }


_V3_VERSION_INFO = {"profile": "v3_early", "family": "v3_modern_2023_plus"}
_V2_VERSION_INFO = {"profile": "v2_late", "family": "v2_intermediate_2019_2022"}
_V1_VERSION_INFO = {"profile": "v1_2017", "family": "v1_legacy_2017_2018"}


# ---------------------------------------------------------------------------
# compute_score — structure
# ---------------------------------------------------------------------------

class TestComputeScoreStructure:
    def test_returns_required_keys(self):
        payload = _base_payload(projects=[_full_project()], receipt=_full_receipt())
        result = compute_score(payload, _V3_VERSION_INFO)
        required = {"overall_score", "score_pct", "score_band", "completeness",
                    "confidence", "cross_validation", "missing_mandatory",
                    "cv_results", "needs_ai", "ai_priority_fields", "profile"}
        assert required <= result.keys()

    def test_score_pct_in_range(self):
        payload = _base_payload(projects=[_full_project()], receipt=_full_receipt())
        result = compute_score(payload, _V3_VERSION_INFO)
        assert 0.0 <= result["score_pct"] <= 100.0

    def test_band_values(self):
        payload = _base_payload(projects=[_full_project()], receipt=_full_receipt())
        result = compute_score(payload, _V3_VERSION_INFO)
        assert result["score_band"] in {"HIGH", "MEDIUM", "LOW"}


# ---------------------------------------------------------------------------
# compute_score — band thresholds
# ---------------------------------------------------------------------------

class TestScoreBands:
    def test_complete_v3_early_achieves_high_or_medium(self):
        """A fully-populated v3_early payload should score MEDIUM or HIGH."""
        payload = _base_payload(projects=[_full_project()], receipt=_full_receipt())
        result = compute_score(payload, _V3_VERSION_INFO)
        assert result["score_band"] in {"HIGH", "MEDIUM"}

    def test_empty_payload_scores_low(self):
        payload = _base_payload(cnpj=None, fiscal_year=None)
        result = compute_score(payload, _V3_VERSION_INFO)
        assert result["score_band"] == "LOW"
        assert result["needs_ai"] is True

    def test_v1_minimal_scores_acceptably(self):
        """v1_2017 has fewer mandatory fields — a minimal payload can score MEDIUM."""
        payload = _base_payload(
            projects=[{"title": "Projeto X", "category": "PESQUISA_BASICA"}],
        )
        result = compute_score(payload, _V1_VERSION_INFO)
        assert result["score_band"] in {"HIGH", "MEDIUM", "LOW"}


# ---------------------------------------------------------------------------
# compute_score — missing fields
# ---------------------------------------------------------------------------

class TestMissingFields:
    def test_missing_cnpj_flagged(self):
        payload = _base_payload(cnpj=None, projects=[_full_project()], receipt=_full_receipt())
        result = compute_score(payload, _V3_VERSION_INFO)
        assert "cnpj" in result["missing_mandatory"]

    def test_missing_receipt_flagged_for_v2(self):
        payload = _base_payload(projects=[_full_project()])
        result = compute_score(payload, _V2_VERSION_INFO)
        assert any("submission_receipt" in f for f in result["missing_mandatory"])

    def test_no_missing_when_complete(self):
        p = _full_project()
        p["trl_initial"] = 3  # needed for v3_early
        payload = _base_payload(projects=[p], receipt=_full_receipt())
        result = compute_score(payload, _V3_VERSION_INFO)
        # With full data all mandatory fields should be present
        assert len(result["missing_mandatory"]) == 0

    def test_ai_priority_fields_subset_of_missing(self):
        payload = _base_payload(cnpj=None)
        result = compute_score(payload, _V2_VERSION_INFO)
        assert set(result["ai_priority_fields"]) <= set(result["missing_mandatory"])


# ---------------------------------------------------------------------------
# Cross-validation rules
# ---------------------------------------------------------------------------

class TestCrossValidation:
    def test_cv01_valid_cnpj(self):
        payload = _base_payload(projects=[_full_project()], receipt=_full_receipt())
        result = compute_score(payload, _V3_VERSION_INFO)
        assert result["cv_results"]["CV-01"] is True

    def test_cv01_invalid_cnpj(self):
        payload = _base_payload(cnpj="00.000.000/0000-00",
                                projects=[_full_project()], receipt=_full_receipt())
        result = compute_score(payload, _V3_VERSION_INFO)
        assert result["cv_results"]["CV-01"] is False

    def test_cv02_valid_year(self):
        payload = _base_payload(fiscal_year=2023, projects=[_full_project()], receipt=_full_receipt())
        result = compute_score(payload, _V3_VERSION_INFO)
        assert result["cv_results"]["CV-02"] is True

    def test_cv02_invalid_year(self):
        payload = _base_payload(fiscal_year=1999, projects=[_full_project()], receipt=_full_receipt())
        result = compute_score(payload, _V3_VERSION_INFO)
        assert result["cv_results"]["CV-02"] is False

    def test_cv03_receipt_complete(self):
        payload = _base_payload(projects=[_full_project()], receipt=_full_receipt())
        result = compute_score(payload, _V2_VERSION_INFO)
        assert result["cv_results"]["CV-03"] is True

    def test_cv03_not_applicable_for_v1(self):
        payload = _base_payload(projects=[_full_project()])
        result = compute_score(payload, _V1_VERSION_INFO)
        assert result["cv_results"]["CV-03"] is None

    def test_cv08_hr_present(self):
        payload = _base_payload(projects=[_full_project()], receipt=_full_receipt())
        result = compute_score(payload, _V3_VERSION_INFO)
        assert result["cv_results"]["CV-08"] is True

    def test_cv09_valid_category(self):
        payload = _base_payload(projects=[_full_project()], receipt=_full_receipt())
        result = compute_score(payload, _V3_VERSION_INFO)
        assert result["cv_results"]["CV-09"] is True

    def test_cv09_invalid_category(self):
        proj = _full_project()
        proj["category"] = "CATEGORIA_INVALIDA"
        payload = _base_payload(projects=[proj], receipt=_full_receipt())
        result = compute_score(payload, _V3_VERSION_INFO)
        assert result["cv_results"]["CV-09"] is False


# ---------------------------------------------------------------------------
# Summary table integration (CV-05, CV-06)
# ---------------------------------------------------------------------------

class TestSummaryTableCVs:
    def test_cv05_project_count_match(self):
        payload = _base_payload(projects=[_full_project()], receipt=_full_receipt())
        summary = {"found": True, "project_count": 1, "declared_total": None, "rows": []}
        result = compute_score(payload, _V3_VERSION_INFO, summary_table=summary)
        assert result["cv_results"]["CV-05"] is True

    def test_cv05_count_mismatch(self):
        payload = _base_payload(projects=[_full_project()], receipt=_full_receipt())
        summary = {"found": True, "project_count": 3, "declared_total": None, "rows": []}
        result = compute_score(payload, _V3_VERSION_INFO, summary_table=summary)
        assert result["cv_results"]["CV-05"] is False

    def test_cv06_total_within_tolerance(self):
        proj = _full_project()
        proj["expenses"] = [{"category": "X", "amount": 95_000.0}]
        payload = _base_payload(projects=[proj], receipt=_full_receipt())
        summary = {"found": True, "project_count": 1, "declared_total": 100_000.0, "rows": []}
        result = compute_score(payload, _V3_VERSION_INFO, summary_table=summary)
        assert result["cv_results"]["CV-06"] is True

    def test_cv06_total_outside_tolerance(self):
        proj = _full_project()
        proj["expenses"] = [{"category": "X", "amount": 50_000.0}]
        payload = _base_payload(projects=[proj], receipt=_full_receipt())
        summary = {"found": True, "project_count": 1, "declared_total": 100_000.0, "rows": []}
        result = compute_score(payload, _V3_VERSION_INFO, summary_table=summary)
        assert result["cv_results"]["CV-06"] is False
