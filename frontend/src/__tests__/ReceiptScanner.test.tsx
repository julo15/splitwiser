import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReceiptScanner from '../ReceiptScanner';

// Mock the image compression module so we can assert whether compressImage is
// invoked. The real implementation throws 'File must be an image' for PDFs,
// which is exactly the regression this test guards against.
import { compressImage } from '../utils/imageCompression';
vi.mock('../utils/imageCompression', () => ({
    compressImage: vi.fn(async (file: File) => file),
}));

// Mock the SyncContext hook so we don't pull in the real syncManager / IndexedDB
// stack. The component only reads `isOnline`.
vi.mock('../contexts/SyncContext', () => ({
    useSync: () => ({ isOnline: true }),
}));

const mockCompressImage = vi.mocked(compressImage);

// A successful scan response with at least one item so handleScan reaches the
// success path (which transitions the component to the 'review' phase).
const scanResult = {
    items: [{ description: 'Coffee', price: 100, quantity: 1 }],
    tax: null,
    tip: null,
    total: 100,
    receipt_image_path: '/static/receipts/x.pdf',
};

function getFileInput(): HTMLInputElement {
    // The component renders a single <input type="file"> (label has sr-only text).
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    return input;
}

function selectFile(input: HTMLInputElement, file: File) {
    Object.defineProperty(input, 'files', {
        configurable: true,
        value: [file],
    });
    fireEvent.change(input);
}

describe('ReceiptScanner upload', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockCompressImage.mockClear();
        mockCompressImage.mockImplementation(async (file: File) => file);

        fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => scanResult,
        }));
        vi.stubGlobal('fetch', fetchMock);
        localStorage.setItem('token', 'test-token');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it('skips compression and POSTs the raw PDF to /ocr/scan-receipt', async () => {
        const onItemsDetected = vi.fn();
        render(<ReceiptScanner onItemsDetected={onItemsDetected} onClose={() => {}} />);

        const pdfFile = new File(['%PDF-1.4 fake'], 'receipt.pdf', {
            type: 'application/pdf',
        });
        selectFile(getFileInput(), pdfFile);

        fireEvent.click(screen.getByRole('button', { name: /scan receipt/i }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        // The key regression assertion: PDFs must NOT be run through compressImage.
        expect(mockCompressImage).not.toHaveBeenCalled();

        // fetch was called against the ocr/scan-receipt endpoint.
        const [url, options] = fetchMock.mock.calls[0];
        expect(String(url)).toContain('ocr/scan-receipt');
        expect(options.method).toBe('POST');

        // The body is FormData containing the original (uncompressed) PDF file.
        const body = options.body as FormData;
        expect(body).toBeInstanceOf(FormData);
        const sentFile = body.get('file') as File;
        expect(sentFile).toBe(pdfFile);
        expect(sentFile.type).toBe('application/pdf');

        // Reached the success/review phase.
        await waitFor(() =>
            expect(screen.getByText(/Detected Items/i)).toBeInTheDocument()
        );
    });

    it('compresses image files before upload', async () => {
        const onItemsDetected = vi.fn();
        render(<ReceiptScanner onItemsDetected={onItemsDetected} onClose={() => {}} />);

        const pngFile = new File(['fake-png-bytes'], 'receipt.png', {
            type: 'image/png',
        });
        selectFile(getFileInput(), pngFile);

        fireEvent.click(screen.getByRole('button', { name: /scan receipt/i }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        // Regression balance: images DO go through compression.
        expect(mockCompressImage).toHaveBeenCalledTimes(1);
        expect(mockCompressImage).toHaveBeenCalledWith(pngFile, 1920, 1);
    });
});
