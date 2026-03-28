"""
Unit tests for receipt_parser.py
Covers v2 inline layout and v3 multiline (DADOS DO REMETENTE) layout.
"""
import re
import pytest
from tests.fixtures.texts import V2_EARLY, V2_LATE, V3_EARLY, V3_LATE
from app.parsers.receipt_parser import parse_submission_receipt


class TestV2Receipt:
    def test_sender_name_extracted(self):
        r = parse_submission_receipt(V2_EARLY)
        assert r["sender_name"] == "Carlos Pereira"

    def test_sender_cpf_extracted(self):
        r = parse_submission_receipt(V2_EARLY)
        # CPF is normalized to digits-only by the parser
        assert r["sender_cpf"] is not None
        assert re.sub(r"\D", "", r["sender_cpf"]) == "11144477735"

    def test_authenticity_code_extracted(self):
        r = parse_submission_receipt(V2_EARLY)
        assert r["authenticity_code"] == "12345678901234567890123"

    def test_expedition_at_extracted(self):
        r = parse_submission_receipt(V2_EARLY)
        assert r["expedition_at"] is not None
        assert "2020" in r["expedition_at"]

    def test_v2_late_receipt(self):
        r = parse_submission_receipt(V2_LATE)
        assert r["sender_name"] == "Fernanda Costa"
        assert r["sender_cpf"] is not None


class TestV3Receipt:
    def test_multiline_sender_name(self):
        """v3: NOME: on one line, value on next — _scan_label must look ahead."""
        r = parse_submission_receipt(V3_EARLY)
        assert r["sender_name"] == "Paulo Rodrigues"

    def test_multiline_cpf(self):
        r = parse_submission_receipt(V3_EARLY)
        assert r["sender_cpf"] is not None
        assert re.sub(r"\D", "", r["sender_cpf"]) == "33322211199"

    def test_uuid_authenticity_code(self):
        r = parse_submission_receipt(V3_EARLY)
        assert r["authenticity_code"] is not None
        assert "-" in r["authenticity_code"]

    def test_v3_late_receipt(self):
        r = parse_submission_receipt(V3_LATE)
        assert r["sender_name"] == "Luciana Ferreira"
        assert r["sender_cpf"] is not None
        assert re.sub(r"\D", "", r["sender_cpf"]) == "77788899900"


class TestMissingReceipt:
    def test_empty_text_returns_none_fields(self):
        r = parse_submission_receipt("")
        assert r["sender_name"] is None
        assert r["sender_cpf"] is None
        assert r["authenticity_code"] is None
