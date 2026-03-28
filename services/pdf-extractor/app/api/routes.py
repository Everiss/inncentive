import base64

import fitz
from fastapi import APIRouter, File, HTTPException, Query, UploadFile

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


# ---------------------------------------------------------------------------
# Structure-check inspection endpoints
# ---------------------------------------------------------------------------


@router.post("/inspect/meta")
async def inspect_meta(file: UploadFile = File(...)):
    """Return page count and dimensions for each page of the PDF."""
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty file")
    with fitz.open(stream=payload, filetype="pdf") as doc:
        pages = []
        for i, page in enumerate(doc):
            r = page.rect
            pages.append({"page": i, "width": r.width, "height": r.height})
        return {"page_count": doc.page_count, "pages": pages}


@router.post("/inspect/page")
async def inspect_page(
    file: UploadFile = File(...),
    page: int = Query(0, ge=0),
    scale: float = Query(1.5, ge=0.5, le=3.0),
):
    """
    Render one PDF page as a base64 PNG and return its text blocks with
    scaled bounding-box coordinates (matching the rendered image pixels).
    """
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty file")

    with fitz.open(stream=payload, filetype="pdf") as doc:
        if page >= doc.page_count:
            raise HTTPException(
                status_code=404,
                detail=f"Página {page} não existe (total: {doc.page_count})",
            )

        pg = doc[page]

        # --- Render page image ---
        mat = fitz.Matrix(scale, scale)
        pix = pg.get_pixmap(matrix=mat, alpha=False)
        image_b64 = base64.b64encode(pix.tobytes("png")).decode()

        # --- Extract text blocks (x0,y0,x1,y1, text, block_no, block_type) ---
        blocks = []
        for b in pg.get_text("blocks"):
            x0, y0, x1, y1, text, block_no, block_type = b
            if block_type != 0 or not text.strip():
                continue
            blocks.append(
                {
                    "block_no": block_no,
                    "text": text.strip(),
                    # bbox scaled to match rendered image pixels
                    "bbox": [
                        round(x0 * scale, 2),
                        round(y0 * scale, 2),
                        round(x1 * scale, 2),
                        round(y1 * scale, 2),
                    ],
                }
            )

        return {
            "page": page,
            "page_count": doc.page_count,
            "width": pix.width,
            "height": pix.height,
            "image_b64": image_b64,
            "blocks": blocks,
        }
