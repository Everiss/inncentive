from typing import Any
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"


class ExtractResponse(BaseModel):
    is_valid_formpd: bool = False
    extraction_source: str = "DETERMINISTIC"
    confidence: str = "LOW"
    cnpj_from_form: str | None = None
    company_name: str | None = None
    fiscal_year: int | None = None
    form_data: dict[str, Any] = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)
    ai_candidates: list[dict[str, Any]] = Field(default_factory=list)
    needs_ai: bool = False
    meta: dict[str, Any] = Field(default_factory=dict)
