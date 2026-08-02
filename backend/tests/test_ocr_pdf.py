"""Tests for PDF support in the receipt-scanning endpoint."""

import io
import os
from unittest.mock import MagicMock, patch

import fitz  # PyMuPDF
import pytest
from fastapi.testclient import TestClient

from dependencies import get_current_user
from main import app
from routers.ocr import MAX_PDF_PAGES, RECEIPT_DIR
from utils.rate_limiter import ocr_rate_limiter

client = TestClient(app)

mock_user = MagicMock()
mock_user.id = 1


@pytest.fixture(autouse=True)
def setup_overrides():
    """Override auth and rate limiter for all tests."""
    app.dependency_overrides[get_current_user] = lambda: mock_user

    async def mock_rate_limit():
        return True

    app.dependency_overrides[ocr_rate_limiter] = mock_rate_limit
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(ocr_rate_limiter, None)


@pytest.fixture
def mock_llm():
    """Mock the LLM parse_receipt function."""
    with patch("routers.ocr.parse_receipt") as mock:
        mock.return_value = {
            "items": [{"description": "Coffee", "price_cents": 500, "quantity": 1}],
            "tax_cents": None,
            "tip_cents": None,
            "total_cents": 500,
        }
        yield mock


def _make_pdf(num_pages: int) -> bytes:
    """Build a simple multi-page PDF in memory."""
    doc = fitz.open()
    for i in range(num_pages):
        page = doc.new_page()
        page.insert_text((72, 72), f"Receipt page {i + 1}\nCoffee $5.00")
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def _cleanup(receipt_path: str):
    filename = receipt_path.split("/")[-1]
    full_path = os.path.join(RECEIPT_DIR, filename)
    if os.path.exists(full_path):
        os.remove(full_path)


def test_single_page_pdf_accepted(mock_llm):
    pdf = _make_pdf(1)
    files = {"file": ("receipt.pdf", pdf, "application/pdf")}

    response = client.post("/ocr/scan-receipt", files=files)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["receipt_image_path"].endswith(".pdf")

    # The original PDF is stored as the receipt artifact.
    mock_llm.assert_called_once()
    pages = mock_llm.call_args.args[0]
    assert len(pages) == 1
    assert pages[0][1] == "image/png"  # rasterized to PNG

    _cleanup(data["receipt_image_path"])


def test_multi_page_pdf_is_one_receipt(mock_llm):
    """A multi-page PDF is sent to the LLM as a single call with all pages."""
    pdf = _make_pdf(3)
    files = {"file": ("receipt.pdf", pdf, "application/pdf")}

    response = client.post("/ocr/scan-receipt", files=files)

    assert response.status_code == 200, response.text
    data = response.json()

    # One call, three page images -> treated as one receipt.
    mock_llm.assert_called_once()
    pages = mock_llm.call_args.args[0]
    assert len(pages) == 3
    assert all(mime == "image/png" for _, mime in pages)

    _cleanup(data["receipt_image_path"])


def test_pdf_exceeding_page_cap_rejected(mock_llm):
    pdf = _make_pdf(MAX_PDF_PAGES + 1)
    files = {"file": ("big.pdf", pdf, "application/pdf")}

    response = client.post("/ocr/scan-receipt", files=files)

    assert response.status_code == 400
    assert "too many pages" in response.json()["detail"].lower()
    mock_llm.assert_not_called()


def test_invalid_pdf_rejected(mock_llm):
    """Content with a PDF magic header but no valid structure is rejected."""
    files = {"file": ("broken.pdf", b"%PDF-1.4 this is not a real pdf", "application/pdf")}

    response = client.post("/ocr/scan-receipt", files=files)

    assert response.status_code == 400
    assert "pdf" in response.json()["detail"].lower()
    mock_llm.assert_not_called()


def test_oversized_pdf_rejected(mock_llm):
    """The 10 MB size cap applies to PDFs too (enforced before parsing)."""
    oversized = b"%PDF-" + b"a" * (10 * 1024 * 1024 + 1)
    files = {"file": ("huge.pdf", oversized, "application/pdf")}

    response = client.post("/ocr/scan-receipt", files=files)

    assert response.status_code == 413
    assert "File size exceeds maximum allowed size" in response.json()["detail"]
    mock_llm.assert_not_called()


def test_rasterize_clamps_huge_page_resolution():
    """A PDF with an enormous page box is clamped to MAX_RENDER_PX (DoS guard)."""
    from PIL import Image

    from routers.ocr import MAX_RENDER_PX, _rasterize_pdf

    doc = fitz.open()
    doc.new_page(width=14400, height=14400)  # PDF max page dimension
    pdf = doc.tobytes()
    doc.close()

    pages = _rasterize_pdf(pdf)
    assert len(pages) == 1
    png_bytes, mime = pages[0]
    assert mime == "image/png"
    img = Image.open(io.BytesIO(png_bytes))
    assert max(img.size) <= MAX_RENDER_PX


def test_image_still_accepted_after_pdf_support(mock_llm):
    """Regression: the image path still works (single page, detected format)."""
    from PIL import Image

    img = Image.new("RGB", (4, 4), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    files = {"file": ("receipt.png", buf.getvalue(), "image/png")}

    response = client.post("/ocr/scan-receipt", files=files)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["receipt_image_path"].endswith(".png")

    mock_llm.assert_called_once()
    pages = mock_llm.call_args.args[0]
    assert len(pages) == 1
    assert pages[0][1] == "image/png"

    _cleanup(data["receipt_image_path"])
