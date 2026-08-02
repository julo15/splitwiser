import { useCallback, useEffect, useState } from 'react';
import { getApiUrl } from '../api';
import type { Group, GroupBalance } from '../types/group';
import type { GroupExpense } from './useGroupData';

interface PublicGroupData {
    group: Group | null;
    expenses: GroupExpense[];
    balances: GroupBalance[];
    loading: boolean;
    error: string | null;
    inGroupCurrency: boolean;
    setInGroupCurrency: (value: boolean) => void;
    reload: () => Promise<void>;
}

/**
 * A group as seen through a public share link.
 *
 * Separate from useGroupData because none of these requests carry auth — the
 * link is the only credential — and the endpoints differ. Deliberately
 * read-only: there is no write path on this surface at all.
 */
export function usePublicGroupData(shareLinkId: string | undefined): PublicGroupData {
    const [group, setGroup] = useState<Group | null>(null);
    const [expenses, setExpenses] = useState<GroupExpense[]>([]);
    const [balances, setBalances] = useState<GroupBalance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [inGroupCurrency, setInGroupCurrency] = useState(true);

    const load = useCallback(async () => {
        if (!shareLinkId) return;
        setLoading(true);
        setError(null);

        try {
            const [groupRes, expensesRes] = await Promise.all([
                fetch(getApiUrl(`groups/public/${shareLinkId}`)),
                fetch(getApiUrl(`groups/public/${shareLinkId}/expenses`)),
            ]);

            if (!groupRes.ok) {
                setError(
                    groupRes.status === 404
                        ? 'This link is no longer valid'
                        : 'Could not load this group'
                );
                return;
            }

            const groupData: Group = await groupRes.json();
            setGroup(groupData);
            setExpenses(expensesRes.ok ? await expensesRes.json() : []);

            const balancesUrl = inGroupCurrency
                ? `groups/public/${shareLinkId}/balances?convert_to=${groupData.default_currency}`
                : `groups/public/${shareLinkId}/balances`;
            const balancesRes = await fetch(getApiUrl(balancesUrl));
            setBalances(balancesRes.ok ? await balancesRes.json() : []);
        } catch {
            setError('Could not load this group');
        } finally {
            setLoading(false);
        }
    }, [shareLinkId, inGroupCurrency]);

    useEffect(() => {
        load();
    }, [load]);

    return {
        group,
        expenses,
        balances,
        loading,
        error,
        inGroupCurrency,
        setInGroupCurrency,
        reload: load,
    };
}
