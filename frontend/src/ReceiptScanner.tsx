import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getApiUrl } from './api';
import { useSync } from './contexts/SyncContext';
import { compressImage } from './utils/imageCompression';

// Synthesize a filename for a clipboard blob that usually has none.
// e.g. image/png -> pasted-receipt.png (defaults to png).
function filenameForBlob(type: string): string {
    const ext = type.startsWith('image/') ? type.slice('image/'.length) : '';
    return `pasted-receipt.${ext || 'png'}`;
}

// Extract the first usable image (or PDF) File from a paste event's clipboard data.
function imageFileFromClipboardEvent(e: ClipboardEvent): File | null {
    const data = e.clipboardData;
    if (!data) return null;

    const items = data.items;
    if (items) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    return file.name
                        ? file
                        : new File([file], filenameForBlob(item.type), { type: item.type });
                }
            }
        }
    }

    // Fall back to a file copied from the OS file manager (may be a PDF).
    const fallback = data.files && data.files[0];
    if (fallback && (fallback.type.startsWith('image/') || fallback.type === 'application/pdf')) {
        return fallback;
    }

    return null;
}

// Extract the first image File from an async clipboard read (navigator.clipboard.read()).
async function imageFileFromAsyncClipboard(items: ClipboardItems): Promise<File | null> {
    for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
            const blob = await item.getType(type);
            return new File([blob], filenameForBlob(type), { type });
        }
    }
    return null;
}

interface ReceiptScannerProps {
    onItemsDetected: (items: { description: string; price: number }[], receiptPath?: string, validationWarning?: string | null, taxCents?: number | null, tipCents?: number | null, totalCents?: number | null) => void;
    onClose: () => void;
}

interface ScannedItem {
    description: string;
    price: number;       // cents
    quantity: number;
}

interface ScanResult {
    items: ScannedItem[];
    tax: number | null;   // cents
    tip: number | null;   // cents
    total: number | null;  // cents
    receipt_image_path: string;
}

type Phase = 'upload' | 'review';

const ReceiptScanner: React.FC<ReceiptScannerProps> = ({ onItemsDetected, onClose }) => {
    const { isOnline } = useSync();
    const [phase, setPhase] = useState<Phase>('upload');
    const [image, setImage] = useState<File | null>(null);
    const [imageUrl, setImageUrl] = useState<string>('');
    const [isPdf, setIsPdf] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>('');

    // Scan results
    const [items, setItems] = useState<ScannedItem[]>([]);
    const [tax, setTax] = useState<number | null>(null);
    const [tip, setTip] = useState<number | null>(null);
    const [total, setTotal] = useState<number | null>(null);
    const [receiptImagePath, setReceiptImagePath] = useState<string>('');

    // Editing state
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editDescription, setEditDescription] = useState('');
    const [editPrice, setEditPrice] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);
    // Tracks the current preview object URL for revocation without making loadFile
    // depend on imageUrl (which would re-subscribe the paste listener every render).
    const objectUrlRef = useRef<string>('');
    // Guards async continuations that can resolve after the modal unmounts
    // (the component is conditionally rendered).
    const mountedRef = useRef(true);
    // Mirrors `loading` so the captured paste closure can re-check it per event.
    const loadingRef = useRef(false);
    // Prevents overlapping clipboard.read() calls from a double-clicked button.
    const pastingRef = useRef(false);

    // Revoke and clear the current preview object URL. Centralized so every
    // genuine teardown site frees the blob (and Re-scan can deliberately skip it).
    const revokePreviewUrl = useCallback(() => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = '';
        }
    }, []);

    // Shared "adopt this file" path for both the file picker and clipboard paste.
    const loadFile = useCallback((file: File) => {
        setImage(file);
        setError('');
        const pdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        setIsPdf(pdf);
        revokePreviewUrl();
        // A blob URL can't be rendered in an <img>, so only create one for images.
        const url = pdf ? '' : URL.createObjectURL(file);
        objectUrlRef.current = url;
        setImageUrl(url);
    }, [revokePreviewUrl]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            loadFile(e.target.files[0]);
        }
    };

    // Revoke the last preview object URL on unmount so closing the modal mid-flow
    // doesn't leak it, and flag the component as unmounted so async continuations
    // (clipboard.read) bail out instead of touching state.
    useEffect(() => () => {
        mountedRef.current = false;
        revokePreviewUrl();
    }, [revokePreviewUrl]);

    // Keyboard paste (Cmd/Ctrl+V): active only in the upload phase and when idle,
    // so pasting while editing an item in the review phase is never hijacked.
    useEffect(() => {
        if (phase !== 'upload' || loading) return;
        const onPaste = (e: ClipboardEvent) => {
            // A scan may have started between setLoading(true) and this effect
            // re-subscribing; don't let a stray paste swap the image mid-upload.
            if (loadingRef.current) return;
            const file = imageFileFromClipboardEvent(e);
            // No image on the clipboard -> let normal paste proceed.
            if (file) loadFile(file);
        };
        document.addEventListener('paste', onPaste);
        return () => document.removeEventListener('paste', onPaste);
    }, [phase, loading, loadFile]);

    const handlePasteFromClipboard = async () => {
        if (!navigator.clipboard?.read) {
            setError("Pasting from the clipboard isn't supported in this browser.");
            return;
        }
        // Ignore a second click while the first read() is still in flight.
        if (pastingRef.current) return;
        pastingRef.current = true;
        try {
            const items = await navigator.clipboard.read();
            // The modal may have closed while awaiting the (permissioned) read.
            if (!mountedRef.current) return;
            const file = await imageFileFromAsyncClipboard(items);
            if (!mountedRef.current) return;
            if (!file) {
                setError('No image found on the clipboard.');
                return;
            }
            loadFile(file);
        } catch {
            if (!mountedRef.current) return;
            setError('Could not read the clipboard. Check clipboard permissions and try again.');
        } finally {
            pastingRef.current = false;
        }
    };

    const handleScan = async () => {
        if (!image) return;

        setLoading(true);
        loadingRef.current = true;
        setError('');

        try {
            // PDFs are sent as-is; compressImage only handles raster images.
            const uploadFile = isPdf ? image : await compressImage(image, 1920, 1);

            const formData = new FormData();
            formData.append('file', uploadFile);

            const token = localStorage.getItem('token');
            const response = await fetch(getApiUrl('ocr/scan-receipt'), {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Receipt scanning failed');
            }

            const data: ScanResult = await response.json();

            if (!data.items || data.items.length === 0) {
                throw new Error('No items detected on the receipt. Please try a clearer photo.');
            }

            setItems(data.items);
            setTax(data.tax);
            setTip(data.tip);
            setTotal(data.total);
            setReceiptImagePath(data.receipt_image_path);
            setPhase('review');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to scan receipt');
        } finally {
            setLoading(false);
            loadingRef.current = false;
        }
    };

    const handleConfirm = () => {
        const finalItems = items.map(item => ({
            description: item.description,
            price: item.price,
        }));

        // Build a validation warning if item total doesn't match receipt total
        let warning: string | null = null;
        if (total != null) {
            const itemSum = items.reduce((sum, i) => sum + i.price, 0);
            const expectedSubtotal = total - (tax ?? 0) - (tip ?? 0);
            if (expectedSubtotal > 0 && Math.abs(itemSum - expectedSubtotal) > 10) {
                warning = `Item total ($${(itemSum / 100).toFixed(2)}) differs from receipt subtotal ($${(expectedSubtotal / 100).toFixed(2)}).`;
            }
        }

        onItemsDetected(finalItems, receiptImagePath, warning, tax, tip, total);
    };

    const handleCancel = () => {
        revokePreviewUrl();
        onClose();
    };

    // Re-scan returns to the upload phase while keeping the selected image and its
    // live preview, so it must NOT revoke the object URL.
    const handleRescan = () => {
        setPhase('upload');
        setItems([]);
        setError('');
    };

    // Inline editing
    const startEditing = (index: number) => {
        setEditingIndex(index);
        setEditDescription(items[index].description);
        setEditPrice((items[index].price / 100).toFixed(2));
    };

    const saveEdit = () => {
        if (editingIndex === null) return;
        const priceCents = Math.round(parseFloat(editPrice || '0') * 100);
        setItems(prev => prev.map((item, i) =>
            i === editingIndex
                ? { ...item, description: editDescription || item.description, price: priceCents }
                : item
        ));
        setEditingIndex(null);
    };

    const cancelEdit = () => {
        setEditingIndex(null);
    };

    const deleteItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
        if (editingIndex === index) setEditingIndex(null);
    };

    const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

    const itemSubtotal = items.reduce((sum, i) => sum + i.price, 0);

    return (
        <div className="fixed inset-0 bg-gray-600 dark:bg-gray-900/75 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl dark:shadow-gray-900/50 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold dark:text-gray-100">Scan Receipt</h2>
                    <div className="flex items-center gap-2 text-sm">
                        <div className={`flex items-center gap-1 ${phase === 'upload' ? 'text-teal-600 dark:text-teal-400 font-semibold' : 'text-gray-400 dark:text-gray-500'}`}>
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${phase === 'upload' ? 'bg-teal-100 dark:bg-teal-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>1</span>
                            <span className="hidden sm:inline">Upload</span>
                        </div>
                        <span className="text-gray-300 dark:text-gray-600">&rarr;</span>
                        <div className={`flex items-center gap-1 ${phase === 'review' ? 'text-teal-600 dark:text-teal-400 font-semibold' : 'text-gray-400 dark:text-gray-500'}`}>
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${phase === 'review' ? 'bg-teal-100 dark:bg-teal-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>2</span>
                            <span className="hidden sm:inline">Review</span>
                        </div>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                    </div>
                )}

                {/* Offline warning */}
                {!isOnline && (
                    <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <p className="text-sm text-yellow-700 dark:text-yellow-400">
                            Receipt scanning requires an internet connection.
                        </p>
                    </div>
                )}

                {/* Upload Phase */}
                {phase === 'upload' && (
                    <div>
                        {!image && (
                            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                <p className="text-sm text-blue-700 dark:text-blue-400">
                                    Take a clear photo of your receipt, upload a PDF, or paste an image from your clipboard. The AI will automatically detect and itemize all purchases.
                                </p>
                            </div>
                        )}

                        <div className="mb-4">
                            <label className="block w-full">
                                <span className="sr-only">Choose receipt</span>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*,application/pdf"
                                    onChange={handleImageChange}
                                    className="block w-full text-sm text-gray-500 dark:text-gray-400
                                        file:mr-4 file:py-2 file:px-4
                                        file:rounded-full file:border-0
                                        file:text-sm file:font-semibold
                                        file:bg-teal-50 file:text-teal-700
                                        hover:file:bg-teal-100
                                        dark:file:bg-teal-900/30 dark:file:text-teal-300
                                        cursor-pointer file:cursor-pointer"
                                />
                            </label>
                            <div className="mt-3">
                                <button
                                    type="button"
                                    onClick={handlePasteFromClipboard}
                                    disabled={loading}
                                    className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full border transition-colors ${
                                        loading
                                            ? 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                            : 'border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/30'
                                    }`}
                                >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    Paste from clipboard
                                </button>
                            </div>
                            {image && (
                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                    Selected: {image.name}
                                </p>
                            )}
                        </div>

                        {imageUrl && (
                            <div className="mb-4">
                                <img
                                    src={imageUrl}
                                    alt="Receipt preview"
                                    className="max-w-full max-h-80 mx-auto rounded border border-gray-300 dark:border-gray-600"
                                />
                            </div>
                        )}

                        {isPdf && image && (
                            <div className="mb-4 flex items-center gap-3 p-4 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40">
                                <svg className="h-8 w-8 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                    <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.414A2 2 0 0017.414 6L14 2.586A2 2 0 0012.586 2H4zm5 10a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                                </svg>
                                <span className="text-sm text-gray-700 dark:text-gray-300 break-all">{image.name}</span>
                            </div>
                        )}

                        {loading && (
                            <div className="mb-4 flex items-center justify-center gap-3 py-6">
                                <svg className="animate-spin h-5 w-5 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                </svg>
                                <span className="text-sm text-gray-600 dark:text-gray-300">Scanning receipt with AI...</span>
                            </div>
                        )}

                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleScan}
                                disabled={!image || loading || !isOnline}
                                className={`px-4 py-2 text-white rounded flex items-center gap-2 ${
                                    !image || loading || !isOnline
                                        ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed'
                                        : 'bg-teal-500 hover:bg-teal-600'
                                }`}
                            >
                                {loading ? 'Scanning...' : 'Scan Receipt'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Review Phase */}
                {phase === 'review' && (
                    <div>
                        {/* Receipt image thumbnail for reference */}
                        {imageUrl && (
                            <details className="mb-4">
                                <summary className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                                    View receipt image
                                </summary>
                                <div className="mt-2">
                                    <img
                                        src={imageUrl}
                                        alt="Receipt"
                                        className="max-w-full max-h-64 mx-auto rounded border border-gray-300 dark:border-gray-600"
                                    />
                                </div>
                            </details>
                        )}
                        {isPdf && image && (
                            <div className="mb-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                <svg className="h-4 w-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                    <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.414A2 2 0 0017.414 6L14 2.586A2 2 0 0012.586 2H4z" clipRule="evenodd" />
                                </svg>
                                <span className="break-all">Scanned from {image.name}</span>
                            </div>
                        )}

                        {/* Items list */}
                        <div className="space-y-2 mb-4">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    Detected Items ({items.length})
                                </h3>
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    Tap an item to edit
                                </span>
                            </div>

                            {items.map((item, index) => (
                                <div
                                    key={index}
                                    className={`border rounded-lg p-3 ${
                                        editingIndex === index
                                            ? 'border-teal-400 dark:border-teal-500 bg-teal-50/50 dark:bg-teal-900/10'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer'
                                    }`}
                                    onClick={() => editingIndex !== index && startEditing(index)}
                                >
                                    {editingIndex === index ? (
                                        <div className="space-y-2">
                                            <input
                                                type="text"
                                                value={editDescription}
                                                onChange={e => setEditDescription(e.target.value)}
                                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100"
                                                placeholder="Item name"
                                                autoFocus
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') saveEdit();
                                                    if (e.key === 'Escape') cancelEdit();
                                                }}
                                            />
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-gray-500 dark:text-gray-400">$</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={editPrice}
                                                    onChange={e => setEditPrice(e.target.value)}
                                                    className="w-28 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100"
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') saveEdit();
                                                        if (e.key === 'Escape') cancelEdit();
                                                    }}
                                                />
                                                <div className="flex-1" />
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
                                                    className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); saveEdit(); }}
                                                    className="px-2 py-1 text-xs text-white bg-teal-500 hover:bg-teal-600 rounded"
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); deleteItem(index); }}
                                                    className="px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between items-center">
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm text-gray-800 dark:text-gray-200 truncate block">
                                                    {item.quantity > 1 && (
                                                        <span className="text-gray-500 dark:text-gray-400 mr-1">{item.quantity}x</span>
                                                    )}
                                                    {item.description}
                                                </span>
                                            </div>
                                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 ml-4 whitespace-nowrap">
                                                {formatCents(item.price)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Summary */}
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600 dark:text-gray-400">Items subtotal</span>
                                <span className="font-medium text-gray-800 dark:text-gray-200">{formatCents(itemSubtotal)}</span>
                            </div>
                            {tax != null && tax > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600 dark:text-gray-400">Tax (from receipt)</span>
                                    <span className="text-gray-600 dark:text-gray-400">{formatCents(tax)}</span>
                                </div>
                            )}
                            {tip != null && tip > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600 dark:text-gray-400">Tip (from receipt)</span>
                                    <span className="text-gray-600 dark:text-gray-400">{formatCents(tip)}</span>
                                </div>
                            )}
                            {total != null && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600 dark:text-gray-400">Receipt total</span>
                                    <span className="text-gray-600 dark:text-gray-400">{formatCents(total)}</span>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end space-x-3 mt-4">
                            <button
                                onClick={handleRescan}
                                className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            >
                                Re-scan
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={items.length === 0}
                                className={`px-4 py-2 text-white rounded ${
                                    items.length === 0
                                        ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed'
                                        : 'bg-teal-500 hover:bg-teal-600'
                                }`}
                            >
                                Confirm Items ({items.length})
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReceiptScanner;
