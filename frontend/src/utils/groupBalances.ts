import type { Balance } from '../types/balance';
import type { Group } from '../types/group';

export interface GroupNet {
    /** Net cents across everyone in the group; positive means you are owed. */
    amount: number;
    currency: string;
}

/**
 * Roll the per-person balance list up into one net figure per group.
 *
 * Returns null for a group with no balances (all square) and for a group whose
 * balances span more than one currency — those cannot be summed without an
 * exchange rate, and the caller should show the per-group breakdown instead.
 * Switching the app to "in my currency" mode makes the server return converted
 * balances, at which point every group resolves to a single currency.
 */
export function netForGroup(balances: Balance[], groupId: number): GroupNet | null {
    const relevant = balances.filter((b) => b.group_id === groupId);
    if (relevant.length === 0) return null;

    const currencies = new Set(relevant.map((b) => b.currency));
    if (currencies.size > 1) return null;

    const amount = relevant.reduce((total, b) => total + b.amount, 0);
    return { amount, currency: relevant[0].currency };
}

/**
 * The groups to surface in the rail's "Pinned" strip: those you have an open
 * balance in first (largest exposure leading), then quiet ones to fill.
 */
export function pinnedGroups(
    groups: Group[],
    balances: Balance[],
    limit = 3
): { group: Group; net: GroupNet | null }[] {
    const withNet = groups.map((group) => ({
        group,
        net: netForGroup(balances, group.id),
    }));

    return withNet
        .slice()
        .sort((a, b) => {
            const aOpen = a.net && a.net.amount !== 0 ? 1 : 0;
            const bOpen = b.net && b.net.amount !== 0 ? 1 : 0;
            if (aOpen !== bOpen) return bOpen - aOpen;
            const aMag = a.net ? Math.abs(a.net.amount) : 0;
            const bMag = b.net ? Math.abs(b.net.amount) : 0;
            if (aMag !== bMag) return bMag - aMag;
            return a.group.name.localeCompare(b.group.name);
        })
        .slice(0, limit);
}
