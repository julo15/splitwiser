/**
 * Person-to-person settlement, assembled from the per-group debt simplification.
 *
 * Background on why this exists: `/balances` does NOT return a list of people.
 * It returns one aggregate row per group (with `user_id: 0` and the group's name
 * in `full_name`), plus per-person rows only for non-group IOUs. The per-person
 * view the design calls for — "Maya owes you $84.20 across Tahoe and 2 more" —
 * has to be built from `/simplify_debts/{group_id}`, which is the only endpoint
 * that returns who should pay whom.
 */

export interface SimplifiedTransaction {
    from_id: number;
    from_is_guest: boolean;
    to_id: number;
    to_is_guest: boolean;
    amount: number;
    currency: string;
}

export interface GroupTransactions {
    groupId: number;
    groupName: string;
    transactions: SimplifiedTransaction[];
}

export interface Counterparty {
    key: string;
    userId: number;
    isGuest: boolean;
    /** Positive: they pay you. Negative: you pay them. */
    amount: number;
    currency: string;
    /** Groups this figure came from, for the row's subtitle. */
    groups: string[];
    /** Set when the whole figure comes from one group. */
    groupId?: number;
}

/**
 * Reduce every group's simplified transactions to one figure per counterparty
 * per currency, from `currentUserId`'s point of view.
 *
 * Transactions between two other people are ignored — they are real, but they
 * are not this user's business and never appear in their totals.
 */
export function settlementForUser(
    groups: GroupTransactions[],
    currentUserId: number
): Counterparty[] {
    const byKey = new Map<string, Counterparty>();

    for (const { groupId, groupName, transactions } of groups) {
        for (const tx of transactions) {
            const iAmPayer = !tx.from_is_guest && tx.from_id === currentUserId;
            const iAmPayee = !tx.to_is_guest && tx.to_id === currentUserId;
            if (iAmPayer === iAmPayee) continue; // not mine, or self-referential

            const otherId = iAmPayer ? tx.to_id : tx.from_id;
            const otherIsGuest = iAmPayer ? tx.to_is_guest : tx.from_is_guest;
            // I pay them → negative; they pay me → positive.
            const signed = iAmPayer ? -tx.amount : tx.amount;

            // Guests are scoped to their group: the same guest id in two groups
            // is two different people.
            const key = otherIsGuest
                ? `guest-${groupId}-${otherId}-${tx.currency}`
                : `user-${otherId}-${tx.currency}`;

            const existing = byKey.get(key);
            if (existing) {
                existing.amount += signed;
                if (!existing.groups.includes(groupName)) {
                    existing.groups.push(groupName);
                    existing.groupId = undefined;
                }
            } else {
                byKey.set(key, {
                    key,
                    userId: otherId,
                    isGuest: otherIsGuest,
                    amount: signed,
                    currency: tx.currency,
                    groups: [groupName],
                    groupId,
                });
            }
        }
    }

    // A counterparty can net to zero across groups — they owe you in one and you
    // owe them in another. Those are settled, so drop them.
    return [...byKey.values()].filter((c) => Math.round(c.amount) !== 0);
}

/**
 * Total across counterparties, when they share a currency. Null otherwise —
 * summing across currencies without a rate would invent a number.
 */
export function settlementTotal(
    counterparties: Counterparty[]
): { amount: number; currency: string } | null {
    if (counterparties.length === 0) return null;
    const currencies = new Set(counterparties.map((c) => c.currency));
    if (currencies.size !== 1) return null;
    return {
        amount: counterparties.reduce((sum, c) => sum + c.amount, 0),
        currency: [...currencies][0],
    };
}
