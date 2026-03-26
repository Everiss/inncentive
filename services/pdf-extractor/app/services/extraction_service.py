from app.api.schemas import ExtractResponse
from app.core.logger import get_logger
from app.extractors.normalize import parse_fiscal_year
from app.extractors.pdf_text import extract_text_pymupdf
from app.parsers.company_parser import parse_company
from app.parsers.projects_parser import parse_projects
from app.parsers.hr_parser import parse_hr
from app.parsers.expenses_parser import parse_expenses
from app.parsers.validators import validate_result

logger = get_logger("extraction_service")


def run_deterministic_extraction(pdf_bytes: bytes, original_name: str) -> ExtractResponse:
    text, page_count = extract_text_pymupdf(pdf_bytes)

    company = parse_company(text)
    fiscal_year = parse_fiscal_year(text)
    projects = parse_projects(text)

    # Optional section-level extracts (for future merge into projects)
    _hr = parse_hr(text)
    _expenses = parse_expenses(text)

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
            "fiscal_year": fiscal_year,
            "projects": projects,
            "representatives": [],
            "fiscal_summary": None,
        },
        "meta": {
            "original_name": original_name,
            "page_count": page_count,
            "text_length": len(text),
        },
    }

    is_valid, confidence, missing_fields, needs_ai = validate_result(payload)
    payload["is_valid_formpd"] = is_valid

    ai_candidates = [
        {
            "field": f,
            "reason": "deterministic_not_confident",
            "priority": "high" if f in {"company_info.cnpj", "fiscal_year"} else "medium",
        }
        for f in missing_fields
    ]

    logger.info(
        "extract completed | valid=%s confidence=%s needs_ai=%s missing=%s",
        is_valid,
        confidence,
        needs_ai,
        ",".join(missing_fields) if missing_fields else "none",
    )

    return ExtractResponse(
        **payload,
        confidence=confidence,
        missing_fields=missing_fields,
        ai_candidates=ai_candidates,
        needs_ai=needs_ai,
    )
