import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStagedReveal } from '../useStagedReveal';

describe('useStagedReveal', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('reveals nothing before the list arrives', () => {
        const { result } = renderHook(() => useStagedReveal<string>(null));
        expect(result.current.revealed).toEqual([]);
        expect(result.current.revealing).toBe(false);
    });

    it('reveals entries one at a time', () => {
        const items = ['a', 'b', 'c'];
        const { result } = renderHook(() =>
            useStagedReveal(items, { intervalMs: 100 })
        );

        expect(result.current.revealed).toEqual([]);
        expect(result.current.revealing).toBe(true);

        act(() => void vi.advanceTimersByTime(100));
        expect(result.current.revealed).toEqual(['a']);

        act(() => void vi.advanceTimersByTime(100));
        expect(result.current.revealed).toEqual(['a', 'b']);

        act(() => void vi.advanceTimersByTime(100));
        expect(result.current.revealed).toEqual(['a', 'b', 'c']);
        expect(result.current.revealing).toBe(false);
    });

    it('stops once everything is shown', () => {
        const items = ['a'];
        const { result } = renderHook(() =>
            useStagedReveal(items, { intervalMs: 50 })
        );

        act(() => void vi.advanceTimersByTime(500));
        // Extra time does not overshoot the list.
        expect(result.current.revealed).toEqual(['a']);
        expect(result.current.revealing).toBe(false);
    });

    it('shrinks the gap so a long list still finishes within the cap', () => {
        const items = Array.from({ length: 40 }, (_, i) => String(i));
        const { result } = renderHook(() =>
            useStagedReveal(items, { intervalMs: 220, maxTotalMs: 2000 })
        );

        // 40 items at the full 220ms gap would take 8.8s; the cap pulls it in.
        act(() => void vi.advanceTimersByTime(2100));
        expect(result.current.revealed).toHaveLength(40);
        expect(result.current.revealing).toBe(false);
    });

    it('never goes below a floor gap, so a huge list is still legible', () => {
        const items = Array.from({ length: 1000 }, (_, i) => String(i));
        const { result } = renderHook(() =>
            useStagedReveal(items, { intervalMs: 220, maxTotalMs: 2000 })
        );

        // Floor is 40ms, so 1000 items cannot all land inside the nominal cap.
        act(() => void vi.advanceTimersByTime(2000));
        expect(result.current.revealed.length).toBeLessThan(1000);
        expect(result.current.revealing).toBe(true);
    });

    it('restarts when a new list replaces the old one', () => {
        const first = ['a', 'b'];
        const { result, rerender } = renderHook(
            ({ items }) => useStagedReveal(items, { intervalMs: 100 }),
            { initialProps: { items: first as string[] | null } }
        );

        act(() => void vi.advanceTimersByTime(200));
        expect(result.current.revealed).toEqual(['a', 'b']);

        rerender({ items: ['x', 'y', 'z'] });
        expect(result.current.revealed).toEqual([]);

        act(() => void vi.advanceTimersByTime(100));
        expect(result.current.revealed).toEqual(['x']);
    });

    it('handles an empty list without spinning', () => {
        const { result } = renderHook(() => useStagedReveal<string>([]));
        expect(result.current.revealed).toEqual([]);
        expect(result.current.revealing).toBe(false);
    });
});
