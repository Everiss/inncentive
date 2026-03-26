from fastapi import APIRouter, File, HTTPException, UploadFile
from app.api.schemas import ExtractResponse, HealthResponse
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
