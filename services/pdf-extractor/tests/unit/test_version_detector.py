"""
Unit tests for version_detector.py
Covers all 6 profiles: v1_2017, v1_2018, v2_early, v2_late, v3_early, v3_late
"""
import pytest
from tests.fixtures.texts import V1_2017, V1_2018, V2_EARLY, V2_LATE, V3_EARLY, V3_LATE
from app.parsers.version_detector import detect_formpd_version


@pytest.mark.parametrize("text,expected_profile,expected_family", [
    (V1_2017, "v1_2017", "v1_legacy_2017_2018"),
    (V1_2018, "v1_2018", "v1_legacy_2017_2018"),
    (V2_EARLY, "v2_early", "v2_intermediate_2019_2022"),
    (V2_LATE,  "v2_late",  "v2_intermediate_2019_2022"),
    (V3_EARLY, "v3_early", "v3_modern_2023_plus"),
    (V3_LATE,  "v3_late",  "v3_modern_2023_plus"),
])
def test_profile_detection(text, expected_profile, expected_family):
    result = detect_formpd_version(text)
    assert result["profile"] == expected_profile, (
        f"Expected profile={expected_profile!r} got {result['profile']!r}\n"
        f"Signals: {result['signals']}"
    )
    assert result["family"] == expected_family


def test_v1_2017_signals():
    result = detect_formpd_version(V1_2017)
    assert result["signals"]["receipt_block"] is False
    assert result["signals"]["radio_buttons"] is True
    # v1_2017 is distinguished from v1_2018 by having NO dados_pessoa_juridica header
    assert result["signals"]["dados_pessoa_juridica"] is False


def test_v2_late_has_item_bracket():
    result = detect_formpd_version(V2_LATE)
    assert result["signals"]["item_bracket"] is True
    assert result["signals"]["receipt_block"] is True


def test_v3_early_has_uuid_auth():
    result = detect_formpd_version(V3_EARLY)
    assert result["signals"]["uuid_auth_code"] is True
    assert result["signals"]["programa_atividades"] is True


def test_v3_late_has_exclusive_signals():
    result = detect_formpd_version(V3_LATE)
    assert result["signals"]["receita_bruta"] is True
    assert result["signals"]["mrl_scale"] is True


def test_returns_year_hint():
    result = detect_formpd_version(V3_LATE)
    assert result.get("year_hint") == 2024


def test_unknown_text_returns_safe_defaults():
    result = detect_formpd_version("Texto qualquer sem marcadores FORMPD")
    assert result["profile"] in {"v1_2017", "v1_2018", "v2_early", "v2_late", "v3_early", "v3_late"}
    assert result["family"] in {"v1_legacy_2017_2018", "v2_intermediate_2019_2022", "v3_modern_2023_plus"}
