import { useEffect, useMemo, useState } from 'react';
import { balancesApi } from '../services/api';
import { useAppData } from '../contexts/AppDataContext';
import { useAuth } from '../AuthContext';
import { settlementForUser } from '../utils/settlement';
import type { Counterparty, GroupTransactions } from '../utils/settlement';

/**
 * Who owes the current user, and who they owe, across every group.
 *
 * Built by fanning out over `/simplify_debts/{group_id}` — one request per
 * group — because no endpoint returns a cross-group person-to-person view.
 * That is the natural place for a future `/settlement` endpoint; until then the
 * fan-out is bounded by the user's group count and runs once per mount.
 */
export function useSettlement(): {
    counterparties: Counterparty[];
    loading: boolean;
} {
    const { user } = useAuth();
    const { groups } = useAppData();
    const [byGroup, setByGroup] = useState<GroupTransactions[]>([]);
    const [loading, setLoading] = useState(true);

    // Depend on the group ids rather than the array identity, so a refetch that
    // returns the same groups does not re-trigger the fan-out.
    const groupKey = groups.map((g) => g.id).join(',');

    useEffect(() => {
        if (groups.length === 0) {
            setByGroup([]);
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);

        Promise.all(
            groups.map(async (group) => {
                try {
                    const data = await balancesApi.simplifyDebts(group.id);
                    return {
                        groupId: group.id,
                        groupName: group.name,
                        transactions: data.transactions ?? [],
                    };
                } catch (error) {
                    console.error(`Failed to simplify debts for ${group.name}:`, error);
                    return {
                        groupId: group.id,
                        groupName: group.name,
                        transactions: [],
                    };
                }
            })
        )
            .then((result) => {
                if (!cancelled) setByGroup(result);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupKey]);

    const counterparties = useMemo(
        () => (user ? settlementForUser(byGroup, user.id) : []),
        [byGroup, user]
    );

    return { counterparties, loading };
}
