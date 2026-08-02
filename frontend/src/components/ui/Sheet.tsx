import React, { useEffect, useRef } from 'react';

export interface SheetProps {
    open: boolean;
    onClose: () => void;
    /** Accessible name for the sheet. */
    label: string;
    /** Optional visible heading rendered above the content. */
    title?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

/**
 * The mobile bottom sheet: content rises from the bottom edge over a dimmed
 * page, with a 24px top radius, a grabber, and the one place in this design
 * where a real (rather than hairline) shadow is used.
 *
 * Closes on Escape and on backdrop press, and traps initial focus so the sheet
 * is reachable by keyboard.
 */
const Sheet: React.FC<SheetProps> = ({
    open,
    onClose,
    label,
    title,
    children,
    className = '',
}) => {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);

        // Move focus into the sheet so keyboard and screen-reader users land on
        // the new content rather than being left behind on the page.
        panelRef.current?.focus();

        // Stop the page behind the sheet from scrolling with it.
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div
                className="absolute inset-0 bg-black/55"
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                tabIndex={-1}
                className={`relative w-full mx-auto bg-sw-bg rounded-t-sw-sheet px-4 pt-3 pb-3.5 flex flex-col gap-[9px] max-h-[88vh] overflow-auto shadow-[0_-12px_40px_rgba(0,0,0,.5)] focus:outline-none ${className}`.trim()}
            >
                <div
                    className="w-[38px] h-1 rounded-sm bg-sw-line mx-auto mb-1 flex-none"
                    aria-hidden="true"
                />
                {title && (
                    <div className="text-[11px] uppercase tracking-[0.09em] text-sw-dim px-0.5 pb-0.5">
                        {title}
                    </div>
                )}
                {children}
            </div>
        </div>
    );
};

export default Sheet;
