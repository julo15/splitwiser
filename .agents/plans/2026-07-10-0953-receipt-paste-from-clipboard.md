# Paste a receipt from the clipboard

**Branch:** `julo/receipt-paste` (worktree at `/private/tmp/splitwiser-receipt-paste`, based on `origin/main` @ `5792967`)
**Date:** 2026-07-10

## Goal

Let a user add a receipt image to the scanner by **pasting from the clipboard**, in
addition to the existing file-picker upload (which already supports images and PDFs).
Typical flow: the user takes a screenshot or copies an image, opens the Add Expense →
Scan Receipt modal, and either presses **⌘/Ctrl+V** or clicks a **"Paste from clipboard"**
button. The pasted image lands in the exact same preview → **Scan Receipt** flow as an
uploaded file.

## Why this is small

The backend already validates uploads **by content, not filename**
(`backend/routers/ocr.py`: `Image.open(...).verify()` → `FORMAT_MAP` allows JPEG/PNG/WEBP;
PDFs detected via the `%PDF-` magic bytes). Clipboard images from a screenshot or
copy are delivered to the browser as **`image/png` blobs**, which already pass this
validation and flow through the existing `compressImage` → `FormData` → `POST /ocr/scan-receipt`
path unchanged.

**⇒ No backend change. No new dependency. No API/schema change.** This is a
frontend-only enhancement to one component: `frontend/src/ReceiptScanner.tsx`.

## Current state (post-PDF, on `origin/main`)

`frontend/src/ReceiptScanner.tsx` (455 lines, Tailwind, two-phase `'upload' | 'review'` modal):

- State: `image: File | null`, `imageUrl: string` (object URL for preview), `isPdf: boolean`,
  `loading`, `error`, plus scan-result state.
- `handleImageChange(e)` (lines 50–61): reads `e.target.files[0]`, sets `image`, computes
  `isPdf` from `file.type`/name, revokes the prior object URL, and sets `imageUrl`
  (`''` for PDFs since blob URLs don't render in `<img>`).
- `handleScan()` (lines 63–105): `isPdf ? image : await compressImage(image, 1920, 1)` →
  `FormData` → `fetch(getApiUrl('ocr/scan-receipt'), { headers: Bearer <token> })`.
- Upload phase UI (lines 197–283): a single `<input type="file" accept="image/*,application/pdf">`,
  an image `<img>` preview, a PDF "file chip", loading spinner, Cancel/Scan buttons.
- Scan button disabled when `!image || loading || !isOnline`.

No clipboard/paste handling exists anywhere in the frontend today (only outbound
`navigator.clipboard.writeText` for share links). This is the first paste-image handler.

Tests: `frontend/src/__tests__/ReceiptScanner.test.tsx` (Vitest + `@testing-library/react`,
`happy-dom`). Existing tests mock `compressImage`, `useSync`, and `fetch`; they select a
file via a `selectFile()` helper that stubs `input.files` and fires `change`. I will extend
this file.

## Design decisions

### Two ways to paste (both wired to the same code path)

1. **Keyboard paste (⌘/Ctrl+V)** — a `paste` event listener attached while the modal is
   open and in the `'upload'` phase. This is the universally-supported mechanism
   (`ClipboardEvent.clipboardData`) and matches user muscle memory.
2. **"Paste from clipboard" button** — an explicit, discoverable affordance that calls the
   async `navigator.clipboard.read()` API, giving the feature a *visible* control (not
   everyone discovers ⌘V). If the API is unsupported, permission is denied, or the clipboard
   holds no image, the button surfaces a plain **error message** in the component's existing
   `error` slot — no keyboard-shortcut fallback hint. Keyboard ⌘/Ctrl+V remains available as
   the universally-supported second path for users who prefer it. (On mobile, where the async
   clipboard read is often unavailable, the existing file picker — camera / photo library —
   is the primary path; this button is an added convenience, not a mobile requirement.)

Both paths funnel into one shared `loadFile(file: File)` helper (see below), so preview,
`isPdf` detection, object-URL lifecycle, and the downstream Scan flow are identical to the
file-picker path.

### Refactor: extract `loadFile(file)`

`handleImageChange` currently inlines the "adopt this file" logic. Extract the body into:

```ts
const loadFile = (file: File) => {
    setImage(file);
    setError('');
    const pdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    setIsPdf(pdf);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(pdf ? '' : URL.createObjectURL(file));
};
```

Because it reads `imageUrl` for revocation, wrap it in `useCallback` with `[imageUrl]`
(the paste `useEffect` depends on it — see below), or read the previous URL via the
functional-setState form to avoid the dependency. **Chosen approach:** `useCallback(loadFile, [imageUrl])`
and revoke using a functional update of `imageUrl` is awkward; instead track the object URL
for revocation via a `useRef` so `loadFile` has a stable identity. Concretely:

- Keep `imageUrl` state for rendering.
- Add `const objectUrlRef = useRef<string>('')`. In `loadFile`, revoke `objectUrlRef.current`,
  set the new URL into both `objectUrlRef.current` and `setImageUrl(...)`.
- This makes `loadFile` dependency-free (stable via `useCallback(..., [])`), which keeps the
  paste `useEffect` from re-subscribing on every render.
- Update `handleImageChange` to just call `loadFile(e.target.files[0])`.
- Update `handleCancel` and the `'upload'` re-scan reset to revoke `objectUrlRef.current`.

### Extracting an image from clipboard data

A single helper handles both entry points:

```ts
// Returns the first image File found in a clipboard payload, or null.
function imageFileFromClipboard(items: DataTransferItemList | ClipboardItems): File | null
```

- **Paste event:** iterate `e.clipboardData.items`; for the first `item.type.startsWith('image/')`,
  use `item.getAsFile()`. Also fall back to `e.clipboardData.files[0]` (covers a file copied
  in the OS file manager, which may be a PDF — route it through `loadFile`, which sets `isPdf`).
- **Button (`navigator.clipboard.read()`):** iterate `ClipboardItem`s; find the first `type`
  in `item.types` starting with `image/`; `await item.getType(type)` → `Blob` → wrap in a
  `File`.

Pasted blobs often have no filename, so synthesize one: `pasted-receipt.<ext>` where `<ext>`
comes from the mime subtype (`image/png` → `png`, default `png`). This keeps `image.name`
displayable and keeps `isPdf` detection correct.

### Guard rails

- The `paste` listener is only active in the `'upload'` phase (attached/detached via
  `useEffect` keyed on `phase`), so pasting while editing an item's description/price in the
  `'review'` phase is never hijacked.
- Ignore the paste event if it carries no image (let normal paste happen). If the **button**
  was used and the clipboard has no image, show an error message.
- Take only the **first** image if multiple are present.
- Don't paste while `loading`.

## Implementation steps

All changes in `frontend/src/ReceiptScanner.tsx` unless noted.

1. **Imports/state:** add `useEffect`, `useCallback` to the React import; add
   `objectUrlRef = useRef('')`. (Keep `fileInputRef`.)

2. **Add `loadFile(file)`** (stable `useCallback(..., [])`, using `objectUrlRef` for
   revocation as described). Rewrite `handleImageChange` to delegate to it. Update
   `handleCancel` and the Re-scan reset button to revoke `objectUrlRef.current` instead of
   `imageUrl`. Also revoke `objectUrlRef.current` in a `useEffect` unmount cleanup so closing
   the outer Add Expense modal mid-flow doesn't leak the last object URL; the paste-listener
   `useEffect` cleanup (step 4) already detaches the listener on unmount / modal-close.

3. **Add clipboard helpers:**
   - `filenameForBlob(type: string): string` → `pasted-receipt.<ext>`.
   - `imageFileFromClipboardEvent(e)` and `imageFileFromAsyncClipboard()` (or one helper with
     two thin call sites). Keep them small and local to the module.

4. **Keyboard paste:** `useEffect` that, when `phase === 'upload' && !loading`, adds a
   `document`-level `paste` listener calling `loadFile(...)` when an image is found; clean up
   on unmount / dep change. Deps: `[phase, loading, loadFile]`.

5. **Paste button handler** `handlePasteFromClipboard()` — all failures use the existing
   `error` state slot (no separate hint UI):
   - If `!navigator.clipboard?.read`, `setError("Pasting from the clipboard isn't supported in this browser.")` and return.
   - `try { const items = await navigator.clipboard.read(); ... loadFile(file) }`
     `catch { setError('Could not read the clipboard. Check clipboard permissions and try again.') }`.
   - If no image is found on the clipboard, `setError('No image found on the clipboard.')`.

6. **UI:** in the upload phase, next to the file input, add a **"Paste from clipboard"**
   button (Tailwind, matching the teal/secondary button style already in the file; include a
   small clipboard SVG icon and dark-mode classes). The button is disabled while `loading`.
   Keyboard ⌘/Ctrl+V still works without any on-screen hint. Optionally extend the existing
   blue info box copy to mention pasting.

7. **Accessibility:** button has discernible text ("Paste from clipboard"); the ⌘/Ctrl+V hint
   is plain text. No focus traps changed.

## Tests (extend `frontend/src/__tests__/ReceiptScanner.test.tsx`)

Reuse the existing mocks (`compressImage`, `useSync`, `fetch`, `localStorage` token). Add a
`describe('ReceiptScanner paste', ...)` block:

1. **Keyboard paste loads an image and scans it.** Dispatch a `paste` event on `document`
   with a synthetic `clipboardData` exposing an `image/png` file via `items[0].getAsFile()`
   (happy-dom lacks a real `ClipboardEvent`, so construct an `Event('paste')` and
   `Object.defineProperty(ev, 'clipboardData', { value: {...} })`). Assert the preview appears
   (`Selected: pasted-receipt.png`), then click **Scan Receipt** and assert `compressImage`
   was called once and `fetch` hit `ocr/scan-receipt`, reaching the review phase.

2. **"Paste from clipboard" button uses the async API.** Stub
   `navigator.clipboard.read` to resolve a `ClipboardItem`-like object
   (`{ types: ['image/png'], getType: async () => new Blob([...], { type: 'image/png' }) }`).
   Click the button; assert the image is adopted (Scan button enabled / filename shown).

3. **Empty clipboard shows an error, not a crash.** `navigator.clipboard.read`
   resolves `[]` (or an item with no image type). Click the button; assert an error message is
   shown and no `fetch` occurs.

4. **Unsupported async API shows an error.** Temporarily remove
   `navigator.clipboard.read`; click the button; assert an error message appears (no throw).

5. **(Regression) pasted PNG goes through `compressImage`.** Same as test 1's scan assertion —
   confirms pasted images take the image path, not the PDF path.

Run: `cd frontend && npm run test -- ReceiptScanner` and `npm run build` (tsc typecheck).
Backend tests unaffected but run `cd backend && pytest tests/` as a sanity check (no OCR change).
All test runs happen **via subagents** per repo convention.

## Risks / edge cases

- **`navigator.clipboard.read()` browser support & permissions.** Firefox historically gated
  it; Safari prompts. Mitigation: the keyboard `paste` path is the reliable primary; the
  button surfaces a plain error in the existing `error` slot on unsupported/denied/no-image.
  Never throw to the user.
- **happy-dom clipboard limitations in tests.** Mitigated by constructing synthetic events and
  stubbing `navigator.clipboard.read` rather than relying on real DOM clipboard support.
- **Object-URL leaks.** Centralizing revocation in `objectUrlRef` (revoked on every `loadFile`,
  on Cancel, and on Re-scan) prevents leaks when a user pastes several times before scanning.
- **Non-image clipboard content** (text, HTML): ignored by the paste listener (normal paste
  proceeds); the button shows the hint.
- **PDF via paste** (rare — a PDF copied in a file manager arrives in `clipboardData.files`):
  routed through `loadFile`, which sets `isPdf` and skips compression, matching upload behavior.

## Out of scope

- Drag-and-drop (separate enhancement).
- Camera capture attribute.
- Any backend, schema, or `llm_service` changes.
- Multi-image paste / batching.

## Acceptance criteria

- [ ] With the Scan Receipt modal open, ⌘/Ctrl+V pastes a copied/screenshotted image into the
      preview and the **Scan Receipt** button becomes enabled.
- [ ] A visible **"Paste from clipboard"** button does the same via `navigator.clipboard.read()`,
      showing a plain error message when unsupported, permission-denied, or the clipboard has no image.
- [ ] Pasted images run through `compressImage` and hit `POST /ocr/scan-receipt`, reaching the
      review phase exactly like an uploaded image.
- [ ] Pasting several images in a row before scanning still previews and scans the **latest**
      correctly; pasting is inert during the review phase. (The no-leak guarantee lives in the
      object-URL lifecycle under Tests / Risks — it's not hand-verifiable from the UI.)
- [ ] New Vitest cases pass; `npm run build` typechecks; backend tests still green.
