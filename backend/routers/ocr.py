"""OCR router: LLM-based receipt scanning endpoint."""

from typing import Annotated
import os
import uuid
import io
import fitz  # PyMuPDF
from PIL import Image
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile

import models
from dependencies import get_current_user
from ocr.llm_service import parse_receipt
from utils.rate_limiter import ocr_rate_limiter
from utils.files import read_upload_file_securely


# Receipt directory path
DATA_DIR = os.getenv("DATA_DIR", "data")
RECEIPT_DIR = os.path.join(DATA_DIR, "receipts")

# Map PIL format names to file extensions and MIME types
FORMAT_MAP = {
    "JPEG": {"ext": "jpg", "mime": "image/jpeg"},
    "PNG":  {"ext": "png", "mime": "image/png"},
    "WEBP": {"ext": "webp", "mime": "image/webp"},
}

# Maximum number of pages allowed in an uploaded PDF.
MAX_PDF_PAGES = 10

# Zoom factor for rasterizing PDF pages (~144 DPI at 2.0). High enough for the LLM
# to read receipt text, bounded so a small multi-page PDF can't blow up memory.
PDF_RENDER_ZOOM = 2.0

router = APIRouter(tags=["ocr"])


def _rasterize_pdf(pdf_bytes: bytes) -> list[tuple[bytes, str]]:
    """Render each PDF page to a PNG image.

    Returns a list of ``(png_bytes, "image/png")`` tuples, one per page.
    Raises HTTPException(400) for invalid PDFs or PDFs exceeding the page cap.
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid PDF file.")

    try:
        if doc.page_count == 0:
            raise HTTPException(status_code=400, detail="Invalid PDF file.")
        if doc.page_count > MAX_PDF_PAGES:
            raise HTTPException(
                status_code=400,
                detail=f"PDF has too many pages ({doc.page_count}). Maximum is {MAX_PDF_PAGES}.",
            )

        matrix = fitz.Matrix(PDF_RENDER_ZOOM, PDF_RENDER_ZOOM)
        pages = []
        for page in doc:
            pixmap = page.get_pixmap(matrix=matrix)
            pages.append((pixmap.tobytes("png"), "image/png"))
        return pages
    finally:
        doc.close()


@router.post("/ocr/scan-receipt", dependencies=[Depends(ocr_rate_limiter)])
async def scan_receipt(
    file: UploadFile = File(...),
    current_user: Annotated[models.User, Depends(get_current_user)] = None,
):
    """
    Scan a receipt using an LLM (GPT-4o) and return extracted items.

    Accepts an image upload (JPEG, PNG, or WebP) or a PDF (up to 10 pages,
    treated as a single receipt), max 10 MB.
    Returns structured item data with prices in cents.
    """
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

    # Read and validate file
    upload_content = await read_upload_file_securely(file, MAX_FILE_SIZE)

    os.makedirs(RECEIPT_DIR, exist_ok=True)

    if upload_content.startswith(b"%PDF-"):
        # PDF: rasterize every page and treat the whole document as one receipt.
        pages = _rasterize_pdf(upload_content)
        filename = f"{uuid.uuid4()}.pdf"
        parse_input = pages
    else:
        # Image: detect format from content (not the filename) for security.
        try:
            image = Image.open(io.BytesIO(upload_content))
            img_format = image.format
            image.verify()
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid image file.")

        if img_format not in FORMAT_MAP:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported image format: {img_format}. Only JPEG, PNG, and WebP are supported.",
            )

        fmt = FORMAT_MAP[img_format]
        filename = f"{uuid.uuid4()}.{fmt['ext']}"
        parse_input = [(upload_content, fmt["mime"])]

    # Save the original upload (preserve the source artifact).
    file_path = os.path.join(RECEIPT_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(upload_content)

    # Call LLM
    try:
        result = parse_receipt(parse_input)
    except RuntimeError as exc:
        # Missing API key or config error
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        print(f"LLM receipt parsing error: {exc}")
        raise HTTPException(
            status_code=502,
            detail="Receipt scanning service is temporarily unavailable. Please try again.",
        )

    # Build response
    items = [
        {
            "description": item["description"],
            "price": item["price_cents"],
            "quantity": item.get("quantity", 1),
        }
        for item in result.get("items", [])
    ]

    return {
        "items": items,
        "tax": result.get("tax_cents"),
        "tip": result.get("tip_cents"),
        "total": result.get("total_cents"),
        "receipt_image_path": f"/static/receipts/{filename}",
    }
