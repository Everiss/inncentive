"""
Unit tests for summary_table_parser.py
Covers v3 project summary table detection and extraction.
"""
import pytest
from tests.fixtures.texts import V3_EARLY, V3_LATE, V1_2017, V2_EARLY
from app.parsers.summary_table_parser import parse_summary_table


class TestV3SummaryTable:
    def test_found_flag_set(self):
        r = parse_summary_table(V3_EARLY)
        assert r["found"] is True

    def test_project_count(self):
        r = parse_summary_table(V3_EARLY)
        assert r["project_count"] == 1

    def test_declared_total_extracted(self):
        r = parse_summary_table(V3_EARLY)
        assert r["declared_total"] == pytest.approx(250_000.0)

    def test_row_has_title(self):
        r = parse_summary_table(V3_EARLY)
        assert len(r["rows"]) == 1
        assert r["rows"][0]["item"] == 1
        assert r["rows"][0]["title"]

    def test_v3_late_declared_total(self):
        r = parse_summary_table(V3_LATE)
        assert r["found"] is True
        assert r["declared_total"] == pytest.approx(400_000.0)


class TestNonV3Forms:
    def test_v1_returns_not_found(self):
        r = parse_summary_table(V1_2017)
        assert r["found"] is False
        assert r["project_count"] == 0

    def test_v2_returns_not_found(self):
        r = parse_summary_table(V2_EARLY)
        assert r["found"] is False

    def test_empty_text(self):
        r = parse_summary_table("")
        assert r["found"] is False
        assert r["declared_total"] is None
