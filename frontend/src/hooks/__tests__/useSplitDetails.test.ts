import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSplitDetails } from '../useSplitDetails';

/*
 * The hook holds the field's raw text and parses nothing. It used to run
 * `parseFloat(value) || 0` on every keystroke, which made a decimal
 * impossible to type: "0." collapsed to 0 before the digits arrived. Parsing
 * now happens once, at calculation time, via `parseSplitValue`.
 *
 * These assertions therefore expect strings. The coercion guarantees the old
 * eager parse provided are still guaranteed — see the `parseSplitValue` tests
 * in utils/__tests__/expenseCalculations.test.ts.
 */
describe('useSplitDetails', () => {
    it('starts empty', () => {
        const { result } = renderHook(() => useSplitDetails());
        expect(result.current.splitDetails).toEqual({});
    });

    it('records the field text verbatim', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', '12.50'));
        // Not 12.5: the trailing zero is the user's, and reformatting it
        // under them mid-entry is exactly what the old behaviour got wrong.
        expect(result.current.splitDetails).toEqual({ user_1: '12.50' });
    });

    it('keeps entries for other participants', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', '10'));
        act(() => result.current.handleSplitDetailChange('guest_2', '20'));
        expect(result.current.splitDetails).toEqual({ user_1: '10', guest_2: '20' });
    });

    it('overwrites an existing value for the same key', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', '10'));
        act(() => result.current.handleSplitDetailChange('user_1', '25'));
        expect(result.current.splitDetails).toEqual({ user_1: '25' });
    });

    it('holds a half-typed decimal rather than collapsing it', () => {
        // The whole point of deferring the parse: "0." has to survive long
        // enough for the next keystroke.
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', '0.'));
        expect(result.current.splitDetails.user_1).toBe('0.');
        act(() => result.current.handleSplitDetailChange('user_1', '0.5'));
        expect(result.current.splitDetails.user_1).toBe('0.5');
    });

    it('keeps a cleared field as an empty string', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', ''));
        expect(result.current.splitDetails.user_1).toBe('');
    });

    it('keeps unparseable text so the field still shows what was typed', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', 'abc'));
        expect(result.current.splitDetails.user_1).toBe('abc');
    });

    it('removes a single participant', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', '10'));
        act(() => result.current.handleSplitDetailChange('user_2', '20'));
        act(() => result.current.removeSplitDetail('user_1'));
        expect(result.current.splitDetails).toEqual({ user_2: '20' });
    });

    it('ignores removal of a key that was never set', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', '10'));
        act(() => result.current.removeSplitDetail('user_99'));
        expect(result.current.splitDetails).toEqual({ user_1: '10' });
    });

    it('supports replacing the whole map', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.setSplitDetails({ user_1: 60, user_2: 40 }));
        expect(result.current.splitDetails).toEqual({ user_1: 60, user_2: 40 });
    });

    it('does not mutate the previous state object', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', '10'));
        const first = result.current.splitDetails;
        act(() => result.current.handleSplitDetailChange('user_2', '20'));
        expect(first).toEqual({ user_1: '10' });
        expect(result.current.splitDetails).not.toBe(first);
    });
});
