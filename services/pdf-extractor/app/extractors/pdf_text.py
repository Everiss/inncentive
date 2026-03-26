import io

import fitz
import pdfplumber


def extract_text_pymupdf(pdf_bytes: bytes) -> tuple[str, int]:
    text_parts: list[str] = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        for page in doc:
            text_parts.append(page.get_text("text") or "")
        return "\n".join(text_parts), doc.page_count


def extract_text_pdfplumber(pdf_bytes: bytes) -> str:
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text_parts.append(page.extract_text() or "")
    return "\n".join(text_parts)
