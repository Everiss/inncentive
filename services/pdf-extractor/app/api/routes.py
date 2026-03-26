from fastapi import APIRouter, File, HTTPException, UploadFile
from app.api.schemas import ExtractResponse, HealthResponse
from app.persistence.mysql_store import fetch_extraction_trace
from app.services.extraction_service import run_deterministic_extraction

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@router.post("/extract", response_model=ExtractResponse)
async def extract(file: UploadFile = File(...)) -> ExtractResponse:
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty file")

    return run_deterministic_extraction(payload, original_name=file.filename or "unknown.pdf")


@router.get("/trace/{request_id}")
def trace(request_id: str):
    data = fetch_extraction_trace(request_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Trace not found for request_id")
    return data
