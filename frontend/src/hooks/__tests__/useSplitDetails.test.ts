import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSplitDetails } from '../useSplitDetails';

describe('useSplitDetails', () => {
    it('starts empty', () => {
        const { result } = renderHook(() => useSplitDetails());
        expect(result.current.splitDetails).toEqual({});
    });

    it('records a parsed numeric value', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', '12.50'));
        expect(result.current.splitDetails).toEqual({ user_1: 12.5 });
    });

    it('keeps entries for other participants', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', '10'));
        act(() => result.current.handleSplitDetailChange('guest_2', '20'));
        expect(result.current.splitDetails).toEqual({ user_1: 10, guest_2: 20 });
    });

    it('overwrites an existing value for the same key', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', '10'));
        act(() => result.current.handleSplitDetailChange('user_1', '25'));
        expect(result.current.splitDetails).toEqual({ user_1: 25 });
    });

    it('coerces a non-numeric entry to 0 rather than NaN', () => {
        // NaN would poison every downstream split total.
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', 'abc'));
        expect(result.current.splitDetails.user_1).toBe(0);
    });

    it('treats a cleared field as 0', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', ''));
        expect(result.current.splitDetails.user_1).toBe(0);
    });

    it('parses the leading number of a partial entry', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', '12.'));
        expect(result.current.splitDetails.user_1).toBe(12);
    });

    it('removes a single participant', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', '10'));
        act(() => result.current.handleSplitDetailChange('user_2', '20'));
        act(() => result.current.removeSplitDetail('user_1'));
        expect(result.current.splitDetails).toEqual({ user_2: 20 });
    });

    it('ignores removal of a key that was never set', () => {
        const { result } = renderHook(() => useSplitDetails());
        act(() => result.current.handleSplitDetailChange('user_1', '10'));
        act(() => result.current.removeSplitDetail('user_99'));
        expect(result.current.splitDetails).toEqual({ user_1: 10 });
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
        expect(first).toEqual({ user_1: 10 });
        expect(result.current.splitDetails).not.toBe(first);
    });
});
