/**
 * Live preview of what each person owes on an open tab.
 *
 * This mirrors backend/utils/tabs.py. The server is the authority — it runs
 * this again at close and its numbers are the ones recorded — but the board
 * and the claim screen both need to show a figure while people are still
 * tapping, and round-tripping every tap would be worse.
 *
 * The test suite runs the same cases as the Python tests so the two cannot
 * drift apart unnoticed.
 */

/** Split `amount` into `n` parts summing exactly to it, remainder first. */
export function splitEvenly(amount: number, n: number): number[] {
    if (n <= 0) return [];
    const base = Math.floor(amount / n);
    const remainder = amount - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

export interface TabShareItem {
    id: number;
    price: number;
    /** Participant ids on this line. Empty means nobody claimed it. */
    claimedBy: number[];
}

/**
 * Each participant's share of the items.
 *
 * An unclaimed line is spread across everyone rather than dropped — closing a
 * tab must not lose money. Claims from someone no longer at the table are
 * ignored, which sends that line down the same orphan path.
 */
export function computeItemShares(
    items: TabShareItem[],
    participantIds: number[]
): Record<number, number> {
    const shares: Record<number, number> = {};
    for (const id of participantIds) shares[id] = 0;
    if (participantIds.length === 0) return shares;

    for (const item of items) {
        const claimers = item.claimedBy.filter((id) => id in shares);
        const recipients = claimers.length > 0 ? claimers : participantIds;
        const parts = splitEvenly(item.price, recipients.length);
        recipients.forEach((id, index) => {
            shares[id] += parts[index];
        });
    }

    return shares;
}

/**
 * Spread `amount` in proportion to `weights`, summing exactly to `amount`.
 * With no weight anywhere it falls back to an even split.
 */
export function distributeProportionally(
    amount: number,
    weights: Record<number, number>
): Record<number, number> {
    const ids = Object.keys(weights).map(Number);
    const result: Record<number, number> = {};
    for (const id of ids) result[id] = 0;
    if (ids.length === 0 || amount === 0) return result;

    const totalWeight = ids.reduce((sum, id) => sum + weights[id], 0);
    if (totalWeight <= 0) {
        const parts = splitEvenly(amount, ids.length);
        ids.forEach((id, index) => {
            result[id] = parts[index];
        });
        return result;
    }

    // Floor each share, then hand the remaining cents to the largest
    // fractional parts so the total lands exactly and favours bigger orders.
    const exact: Record<number, number> = {};
    let assigned = 0;
    for (const id of ids) {
        exact[id] = (amount * weights[id]) / totalWeight;
        result[id] = Math.floor(exact[id]);
        assigned += result[id];
    }

    const remainder = amount - assigned;
    const byFraction = [...ids].sort((a, b) => {
        const fracDiff = exact[b] - result[b] - (exact[a] - result[a]);
        if (fracDiff !== 0) return fracDiff;
        if (weights[b] !== weights[a]) return weights[b] - weights[a];
        // Matches the Python tie-break (-pid, reversed) so both agree.
        return a - b;
    });
    for (let i = 0; i < remainder; i++) result[byFraction[i]] += 1;

    return result;
}

/**
 * What each participant owes for the whole tab: their items plus their
 * proportional share of tax and tip. Sums exactly to items + tax + tip.
 */
export function computeTabShares(
    items: TabShareItem[],
    participantIds: number[],
    tax = 0,
    tip = 0
): Record<number, number> {
    const itemShares = computeItemShares(items, participantIds);
    const extras = distributeProportionally(tax + tip, itemShares);
    const result: Record<number, number> = {};
    for (const id of participantIds) result[id] = itemShares[id] + extras[id];
    return result;
}

/** Total of every line nobody has claimed — what the host still has to chase. */
export function unclaimedTotal(items: TabShareItem[]): number {
    return items
        .filter((item) => item.claimedBy.length === 0)
        .reduce((sum, item) => sum + item.price, 0);
}

/** Total of the lines that do have a claimer. */
export function claimedTotal(items: TabShareItem[]): number {
    return items
        .filter((item) => item.claimedBy.length > 0)
        .reduce((sum, item) => sum + item.price, 0);
}
