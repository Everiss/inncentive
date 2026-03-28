import hashlib
import uuid

from app.api.schemas import ExtractResponse
from app.core.logger import get_logger
from app.extractors.normalize import parse_fiscal_year
from app.extractors.pdf_text import extract_text_pdfplumber, extract_text_pymupdf
from app.persistence.mysql_store import persist_extraction
from app.parsers.company_parser import parse_company
from app.parsers.company_registry_parser import parse_company_registry
from app.parsers.projects_parser import parse_projects
from app.parsers.hr_parser import parse_hr
from app.parsers.expenses_parser import parse_expenses
from app.parsers.equipment_parser import parse_equipment
from app.parsers.company_identification_parser import parse_company_identification
from app.parsers.receipt_parser import parse_submission_receipt
from app.parsers.version_detector import detect_formpd_version
from app.parsers.validators import validate_result
from app.parsers.summary_table_parser import parse_summary_table
from app.parsers.scorer import compute_score

logger = get_logger("extraction_service")


def run_deterministic_extraction(pdf_bytes: bytes, original_name: str) -> ExtractResponse:
    request_id = str(uuid.uuid4())
    file_hash = hashlib.sha256(pdf_bytes).hexdigest()

    text, page_count = extract_text_pymupdf(pdf_bytes)
    text_source = "pymupdf"

    # Some PDFs (especially newer/scanned variants) may return very small text via PyMuPDF.
    if len(text or "") < 1200:
        plumber_text = extract_text_pdfplumber(pdf_bytes)
        if len(plumber_text or "") > len(text or ""):
            text = plumber_text
            text_source = "pdfplumber"

    version_info = detect_formpd_version(text)
    _profile = version_info.get("profile")

    company = parse_company(text)
    company_registry = parse_company_registry(text)
    fiscal_year = parse_fiscal_year(text)
    projects = parse_projects(text, profile=version_info.get("family"))
    submission_receipt = parse_submission_receipt(text)
    company_identification = parse_company_identification(text)
    summary_table = parse_summary_table(text)

    # Optional section-level extracts and merge into projects (by item index).
    _family = version_info.get("family")
    _hr = parse_hr(text, family=_family)
    _expenses = parse_expenses(text, family=_family)
    _equipment = parse_equipment(text)

    if projects and _hr:
        hr_by_project: dict[int, list[dict]] = {}
        for row in _hr:
            idx = int(row.get("project_index") or 1)
            hr_item = {
                "cpf": row.get("cpf"),
                "name": row.get("name"),
                "role": row.get("role") or row.get("qualification"),
                "qualification": row.get("qualification"),
                "annual_hours": row.get("annual_hours"),
                "dedication_type": row.get("dedication_type"),
                "dedication_pct": row.get("dedication_pct"),
                "annual_amount": row.get("annual_amount"),
            }
            hr_by_project.setdefault(idx, []).append(hr_item)

        for i, p in enumerate(projects, start=1):
            if hr_by_project.get(i):
                p["human_resources"] = hr_by_project[i]

    if projects and _expenses:
        exp_by_project: dict[int, list[dict]] = {}
        for row in _expenses:
            idx = int(row.get("project_index") or 1)
            exp_item = {
                "category": row.get("category"),
                "description": row.get("description"),
                "amount": row.get("amount"),
            }
            # v1/v2 enrichment fields — included when present
            for _extra in ("supplier_cnpj_raw", "supplier_name", "service_status"):
                if row.get(_extra) is not None:
                    exp_item[_extra] = row[_extra]
            exp_by_project.setdefault(idx, []).append(exp_item)

        for i, p in enumerate(projects, start=1):
            if exp_by_project.get(i):
                p["expenses"] = exp_by_project[i]

    if projects and _equipment:
        eq_by_project: dict[int, list[dict]] = {}
        for row in _equipment:
            idx = int(row.get("project_index") or 1)
            eq_item = {
                "origin": row.get("origin"),
                "description": row.get("description"),
                "amount": row.get("amount"),
            }
            eq_by_project.setdefault(idx, []).append(eq_item)

        for i, p in enumerate(projects, start=1):
            if eq_by_project.get(i):
                p["equipment"] = eq_by_project[i]

    payload = {
        "is_valid_formpd": False,
        "extraction_source": "DETERMINISTIC",
        "cnpj_from_form": company.get("cnpj"),
        "company_name": company.get("legal_name"),
        "fiscal_year": fiscal_year,
        "form_data": {
            "company_info": {
                "cnpj": company.get("cnpj"),
                "legal_name": company.get("legal_name"),
            },
            "company_registry": company_registry,
            "fiscal_year": fiscal_year,
            "submission_receipt": submission_receipt,
            "company_identification": company_identification,
            "projects": projects,
            "representatives": [],
            "fiscal_summary": None,
            "summary_table": summary_table,
        },
        "submission_receipt": submission_receipt,
        "company_registry": company_registry,
        "company_identification": company_identification,
        "meta": {
            "request_id": request_id,
            "file_hash": file_hash,
            "original_name": original_name,
            "page_count": page_count,
            "text_length": len(text),
            "text_source": text_source,
            "detected_version": version_info,
        },
    }

    is_valid, confidence, missing_fields, needs_ai = validate_result(payload, version_info=version_info)
    payload["is_valid_formpd"] = is_valid

    # Scoring engine — replaces raw confidence/missing_fields logic
    score_result = compute_score(payload, version_info, summary_table=summary_table)

    high_priority_fields = {
        "company_info.cnpj",
        "fiscal_year",
        "projects",
        "submission_receipt.sender_name",
        "submission_receipt.sender_cpf",
        "submission_receipt.authenticity_code",
    }
    ai_candidates = [
        {
            "field": f,
            "reason": "deterministic_not_confident",
            "priority": "high" if f in high_priority_fields else "medium",
        }
        for f in score_result["ai_priority_fields"]
    ]
    payload["meta"]["quality_policy"] = {
        "family": version_info.get("family"),
        "profile": _profile,
        "requires_receipt": version_info.get("family") in {"v2_intermediate_2019_2022", "v3_modern_2023_plus"},
        "missing_count": len(score_result["missing_mandatory"]),
        "score": score_result,
    }

    logger.info(
        "extract completed | valid=%s score=%.2f band=%s needs_ai=%s missing=%s profile=%s",
        is_valid,
        score_result["score_pct"],
        score_result["score_band"],
        score_result["needs_ai"],
        ",".join(score_result["missing_mandatory"]) if score_result["missing_mandatory"] else "none",
        _profile,
    )

    persist_extraction(
        request_id=request_id,
        file_hash=file_hash,
        original_name=original_name,
        parser_version="v2",
        payload=payload
        | {
            "confidence": score_result["score_band"],
            "missing_fields": score_result["missing_mandatory"],
            "needs_ai": score_result["needs_ai"],
            "score": score_result,
        },
        raw_text=text,
    )

    return ExtractResponse(
        **payload,
        confidence=score_result["score_band"],
        missing_fields=score_result["missing_mandatory"],
        ai_candidates=ai_candidates,
        needs_ai=score_result["needs_ai"],
    )
