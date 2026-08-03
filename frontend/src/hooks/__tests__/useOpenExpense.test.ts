import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOpenExpense } from '../useOpenExpense';

const getById = vi.fn();
vi.mock('../../services/api', () => ({
    groupsApi: {
        getById: (...args: unknown[]) => getById(...args),
    },
}));

/*
 * The feeds used to route a click to the group page rather than open the
 * expense, because the detail modal wanted the group's members and guests.
 * That made a group expense open the wrong thing, and left an expense with no
 * group — a direct payment, or the one a closed tab settles into — with
 * nowhere to go at all, so the click did nothing.
 *
 * The hook's contract is that the expense opens straight away and the group
 * context, which only the edit form needs, catches up.
 */
describe('useOpenExpense', () => {
    beforeEach(() => {
        getById.mockReset();
    });

    it('opens nothing until asked', () => {
        const { result } = renderHook(() => useOpenExpense());
        expect(result.current.expenseId).toBeNull();
    });

    it('opens an expense that belongs to no group, and fetches nothing', () => {
        const { result } = renderHook(() => useOpenExpense());

        act(() => result.current.open({ id: 7, group_id: null }));

        expect(result.current.expenseId).toBe(7);
        expect(getById).not.toHaveBeenCalled();
    });

    it('opens a group expense immediately, before its group arrives', () => {
        getById.mockReturnValue(new Promise(() => {}));
        const { result } = renderHook(() => useOpenExpense());

        act(() => result.current.open({ id: 7, group_id: 3 }));

        // The click is honoured now; the members are a detail of the edit form.
        expect(result.current.expenseId).toBe(7);
        expect(result.current.members).toEqual([]);
    });

    it('fills in the group context when it arrives', async () => {
        getById.mockResolvedValue({
            members: [{ user_id: 1, full_name: 'Vince' }],
            guests: [{ id: 2, name: 'Maya' }],
        });
        const { result } = renderHook(() => useOpenExpense());

        act(() => result.current.open({ id: 7, group_id: 3 }));

        await waitFor(() => expect(result.current.members).toHaveLength(1));
        expect(getById).toHaveBeenCalledWith(3);
        expect(result.current.guests).toHaveLength(1);
    });

    it('still opens when the group cannot be fetched', async () => {
        getById.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useOpenExpense());

        act(() => result.current.open({ id: 7, group_id: 3 }));

        await waitFor(() => expect(getById).toHaveBeenCalled());
        // Viewing needs nothing from the group; only editing is poorer.
        expect(result.current.expenseId).toBe(7);
        expect(result.current.members).toEqual([]);
    });

    it('drops a group that lands after the modal moved on', async () => {
        let settleFirst: (value: unknown) => void = () => {};
        getById
            .mockReturnValueOnce(
                new Promise((resolve) => {
                    settleFirst = resolve;
                })
            )
            .mockResolvedValueOnce({ members: [], guests: [] });

        const { result } = renderHook(() => useOpenExpense());

        act(() => result.current.open({ id: 7, group_id: 3 }));
        act(() => result.current.open({ id: 9, group_id: 4 }));

        // The first group finally answers — for an expense nobody is looking at.
        await act(async () => {
            settleFirst({ members: [{ user_id: 1, full_name: 'Stale' }], guests: [] });
        });

        expect(result.current.expenseId).toBe(9);
        expect(result.current.members).toEqual([]);
    });

    it('forgets everything on close', async () => {
        getById.mockResolvedValue({ members: [{ user_id: 1 }], guests: [] });
        const { result } = renderHook(() => useOpenExpense());

        act(() => result.current.open({ id: 7, group_id: 3 }));
        await waitFor(() => expect(result.current.members).toHaveLength(1));

        act(() => result.current.close());
        expect(result.current.expenseId).toBeNull();
    });
});
