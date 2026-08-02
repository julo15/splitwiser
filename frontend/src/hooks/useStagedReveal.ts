import { useEffect, useRef, useState } from 'react';

export interface StagedRevealOptions {
    /** Gap between revealed entries, in ms. */
    intervalMs?: number;
    /**
     * Cap on the whole reveal. A receipt with thirty lines should not take
     * thirty intervals; the gap shrinks to fit instead.
     */
    maxTotalMs?: number;
}

/**
 * Reveal a list one entry at a time once it arrives.
 *
 * The scan endpoint answers in a single pass, so there is nothing to stream.
 * This is presentation only: the items are already in hand, and showing them
 * land one by one turns a blank spinner into visible progress. It deliberately
 * does not slow anything down — the reveal starts when the response does, and
 * `revealing` goes false the moment the last entry is shown.
 */
export function useStagedReveal<T>(
    items: T[] | null,
    { intervalMs = 220, maxTotalMs = 2600 }: StagedRevealOptions = {}
): { revealed: T[]; revealing: boolean } {
    const [count, setCount] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        if (!items || items.length === 0) {
            setCount(0);
            return;
        }

        setCount(0);

        // Shrink the gap rather than let a long receipt drag on.
        const step = Math.min(intervalMs, Math.max(40, maxTotalMs / items.length));

        timerRef.current = setInterval(() => {
            setCount((current) => {
                const next = current + 1;
                if (next >= items.length && timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
                return Math.min(next, items.length);
            });
        }, step);

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [items, intervalMs, maxTotalMs]);

    if (!items) return { revealed: [], revealing: false };

    return {
        revealed: items.slice(0, count),
        revealing: count < items.length,
    };
}
