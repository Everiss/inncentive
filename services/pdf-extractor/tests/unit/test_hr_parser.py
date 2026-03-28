"""
Unit tests for hr_parser.py
Covers v1 numbered sections, v2 numbered sections, and v3 table layout.
"""
import pytest
from tests.fixtures.texts import V1_2017, V1_2018, V2_EARLY, V2_LATE, V3_EARLY, V3_LATE
from app.parsers.hr_parser import parse_hr


class TestV1Hr:
    def test_returns_list(self):
        rows = parse_hr(V1_2017, family="v1_legacy_2017_2018")
        assert isinstance(rows, list)

    def test_finds_at_least_one_person(self):
        rows = parse_hr(V1_2017, family="v1_legacy_2017_2018")
        assert len(rows) >= 1

    def test_extracts_name(self):
        rows = parse_hr(V1_2017, family="v1_legacy_2017_2018")
        names = [r.get("name") for r in rows]
        assert any(n and "SILVA" in n.upper() for n in names)

    def test_extracts_annual_amount(self):
        rows = parse_hr(V1_2017, family="v1_legacy_2017_2018")
        amounts = [r.get("annual_amount") for r in rows if r.get("annual_amount")]
        assert len(amounts) >= 1
        assert all(isinstance(a, (int, float)) for a in amounts)


class TestV2Hr:
    def test_v2_early_finds_person(self):
        rows = parse_hr(V2_EARLY, family="v2_intermediate_2019_2022")
        assert len(rows) >= 1
        names = [r.get("name") for r in rows]
        assert any(n and "LIMA" in n.upper() for n in names)

    def test_v2_late_finds_person(self):
        rows = parse_hr(V2_LATE, family="v2_intermediate_2019_2022")
        assert len(rows) >= 1


class TestV3Hr:
    def test_v3_early_finds_both_people(self):
        rows = parse_hr(V3_EARLY, family="v3_modern_2023_plus")
        assert len(rows) >= 2

    def test_v3_early_extracts_cpf(self):
        rows = parse_hr(V3_EARLY, family="v3_modern_2023_plus")
        cpfs = [r.get("cpf") for r in rows if r.get("cpf")]
        assert len(cpfs) >= 1

    def test_v3_early_extracts_annual_amount(self):
        rows = parse_hr(V3_EARLY, family="v3_modern_2023_plus")
        amounts = [r.get("annual_amount") for r in rows if r.get("annual_amount")]
        assert len(amounts) >= 1
        assert any(a > 0 for a in amounts)

    def test_v3_late_finds_people(self):
        rows = parse_hr(V3_LATE, family="v3_modern_2023_plus")
        assert len(rows) >= 2

    def test_v3_dedication_type(self):
        rows = parse_hr(V3_EARLY, family="v3_modern_2023_plus")
        types = [r.get("dedication_type") for r in rows if r.get("dedication_type")]
        assert any(t in ("EXCLUSIVA", "PARCIAL") for t in types)
