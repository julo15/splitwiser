# Plan: PDF support for the receipt scanner

**Branch:** `julo/receipt-scanner-pdf` (worktree `/tmp/splitwiser-pdf`, off `main` @ 29396cc)
**Date:** 2026-06-15

## Goal

Let the receipt scanner accept PDFs in addition to images. The endpoint
`POST /ocr/scan-receipt` and the `ReceiptScanner` upload UI both gain PDF support.

## Requirements (confirmed with Julian)

1. **Multi-page = one receipt.** A multi-page PDF is a single receipt: OCR every
   page and merge into one result (one `items`/`tax`/`tip`/`total`).
2. **PDF → images, reuse the image OCR path.** Rasterize pages to images and feed
   them through the existing `parse_receipt` LLM path. Provider-agnostic (works for
   both OpenAI and Gemini), unlike native-PDF which only works on Gemini today.
3. **Limits:** keep the existing **10 MB** size cap; add a **max page count of 10**
   (reject with 400 if exceeded).
4. **Scope:** backend + frontend `accept` attribute (users can actually pick PDFs).

## Current state (recon)

- `backend/routers/ocr.py` — single endpoint. Accepts JPEG/PNG/WebP via PIL
  magic-byte detection (`Image.open` → `.format` → `.verify()`); 10 MB cap via
  `read_upload_file_securely`. Saves to `data/receipts/<uuid>.<ext>`, calls
  `parse_receipt(bytes, mime_type)`, returns `{items, tax, tip, total, receipt_image_path}`.
- `backend/ocr/llm_service.py` — `parse_receipt(image_bytes, mime_type)` dispatches
  to `ocr/providers/{openai,gemini}_provider.py`. Each sends **one** image to the LLM.
- `backend/main.py:39` — `/static/receipts` is a `StaticFiles` mount serving the dir.
- `backend/models.py:76` — `Expense.receipt_image_path` (nullable String). No
  Receipt table, no DB-level file-type constraint.
- `frontend/src/ReceiptScanner.tsx` — file input `accept="image/*"`; preview renders
  the selected file with `<img src={URL.createObjectURL(file)}>` (won't render a PDF).
- Tests: `backend/tests/test_upload_security.py` covers the upload path (mocks
  `routers.ocr.parse_receipt`). No dedicated OCR test file. Frontend uses vitest but
  has no `ReceiptScanner` component test (only utils/hooks tests).

## Library choice: PyMuPDF (`pymupdf`, `import fitz`)

- Pip-installable wheels, **no system binary** required (unlike `pdf2image`, which
  needs poppler via a system package manager — against the no-brew-for-deps rule).
- Used only server-side to **rasterize** (render to pixmap); it does not execute any
  JavaScript embedded in the PDF.
- License note: PyMuPDF is **AGPL-3.0 / commercial**. Fine for this project, but
  flag it in the PR so Julian is aware.

## Implementation

### 1. Backend dependency
- Add `pymupdf` to `backend/requirements.txt`.
- Install into the active env so tests can run.

### 2. Multi-image LLM path (`llm_service.py` + providers)
Send all page images in **one** LLM call so the model sees the whole receipt and
produces one coherent result (cross-page subtotal validation, discounts, etc.).

- `llm_service.parse_receipt(images, mime_type="image/jpeg")`:
  - If `images` is `bytes` → normalize to `[(images, mime_type)]` (back-compat;
    keeps the existing single-image callers and the test mock working).
  - If `images` is a list of `(bytes, mime)` → pass through.
  - Dispatch the list to the provider; keep the existing item sanitization.
- `openai_provider.parse_receipt(images)` — build one user message with multiple
  `{"type": "image_url", ...}` content parts (one per page).
- `gemini_provider.parse_receipt(images)` — pass multiple `types.Part.from_bytes(...)`
  in `contents`.

### 3. PDF branch in the router (`ocr.py`)
- Detect PDF by magic bytes (`content.startswith(b"%PDF-")`) **before** the PIL path.
- Image path: unchanged.
- PDF path:
  1. Open with `fitz.open(stream=content, filetype="pdf")` inside try/except →
     400 "Invalid PDF file." on failure.
  2. If `doc.page_count > MAX_PDF_PAGES (10)` → 400 "PDF has too many pages (max 10).".
  3. Render each page to PNG bytes at a bounded zoom (~2x / ~150 DPI) →
     `list[(png_bytes, "image/png")]`.
  4. Save the **original PDF** as `<uuid>.pdf` (preserve the source artifact);
     `receipt_image_path = /static/receipts/<uuid>.pdf`.
  5. `parse_receipt(pages)` → same response shape.
- Keep the 10 MB cap (already enforced before branching).

### 4. Frontend (`ReceiptScanner.tsx`)
- `accept="image/*"` → `accept="image/*,application/pdf"`.
- Add `isPdf` state set in `handleImageChange` from `file.type === "application/pdf"`
  (or `.pdf` extension fallback).
- Preview: if `isPdf`, render a PDF placeholder (file icon + filename) instead of
  `<img>` (both the upload-phase preview and the review-phase "View receipt" block).
- Update helper copy to mention PDFs ("…or upload a PDF").
- The scan request already sends the raw `File`; no change to `handleScan`.

## Tests (run via subagents)

### Backend (`backend/tests/test_ocr_pdf.py`, mock `parse_receipt`)
- Single-page PDF → 200, `receipt_image_path` ends `.pdf`, `parse_receipt` called once.
- 2-page PDF → 200, `parse_receipt` called once with a list of 2 page images
  (assert the merge-into-one-call behavior).
- 11-page PDF → 400 "too many pages".
- `%PDF-`-prefixed garbage → 400 "Invalid PDF".
- PDF > 10 MB → 413 (size cap still applies).
- Generate fixtures in-test with `fitz` (new doc + pages) so they're self-contained.
- Re-run `test_upload_security.py` to confirm image path + back-compat intact.

### Frontend
- `npm run build` + `npm run lint` (no component test harness for ReceiptScanner;
  add a small vitest only if low-cost). Manual note for PDF preview placeholder.

## Out of scope / notes
- No DB/model changes (`receipt_image_path` already a free String).
- No native-PDF-to-provider path (Gemini-only; rejected per requirement #2).
- Serving the stored PDF via `/static/receipts` is consistent with how images are
  served today; the prior XSS fix was about saving with the **detected** extension,
  which we preserve (`.pdf`).
- Don't touch the parallel branches (`receipt-purpose-breakdown`,
  `llm-receipt-scanning`, `group-spending-summary`). No merge/push without Julian.
