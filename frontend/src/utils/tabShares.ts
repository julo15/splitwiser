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
    /** Only read when building a breakdown; the share maths ignores it. */
    description?: string;
}

/** Map tab items as the API returns them onto what the share maths wants. */
export function toShareItems(
    items: {
        id: number;
        price: number;
        description: string;
        claimed_by: number[];
    }[]
): TabShareItem[] {
    return items.map((item) => ({
        id: item.id,
        price: item.price,
        description: item.description,
        claimedBy: item.claimed_by,
    }));
}

/** One line as it lands on one person. */
export interface TabShareLine {
    itemId: number;
    description: string;
    /** The whole line, as printed on the receipt. */
    price: number;
    /** This person's part of it. */
    amount: number;
    /** How many people carry the line, this person included. */
    splitCount: number;
    /** Nobody claimed it, so it fell to the whole table. */
    orphan: boolean;
}

/**
 * Hand every item to whoever carries it, keeping the line-by-line detail.
 *
 * An unclaimed line is spread across everyone rather than dropped — closing a
 * tab must not lose money. Claims from someone no longer at the table are
 * ignored, which sends that line down the same orphan path.
 *
 * Both the totals and the itemised breakdown are derived from this one walk,
 * so a person's lines always add up to the figure shown beside their name.
 */
function allocateLines(
    items: TabShareItem[],
    participantIds: number[]
): Record<number, TabShareLine[]> {
    const lines: Record<number, TabShareLine[]> = {};
    for (const id of participantIds) lines[id] = [];
    if (participantIds.length === 0) return lines;

    for (const item of items) {
        const claimers = item.claimedBy.filter((id) => id in lines);
        const orphan = claimers.length === 0;
        const recipients = orphan ? participantIds : claimers;
        const parts = splitEvenly(item.price, recipients.length);
        recipients.forEach((id, index) => {
            lines[id].push({
                itemId: item.id,
                description: item.description ?? '',
                price: item.price,
                amount: parts[index],
                splitCount: recipients.length,
                orphan,
            });
        });
    }

    return lines;
}

/** Each participant's share of the items. */
export function computeItemShares(
    items: TabShareItem[],
    participantIds: number[]
): Record<number, number> {
    const lines = allocateLines(items, participantIds);
    const shares: Record<number, number> = {};
    for (const id of participantIds) {
        shares[id] = lines[id].reduce((sum, line) => sum + line.amount, 0);
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

/** Everything one person is carrying, itemised. */
export interface TabBreakdown {
    participantId: number;
    /** Their lines, in receipt order. Orphans are marked, not hidden. */
    lines: TabShareLine[];
    /** Sum of `lines` — everything before tax and tip. */
    items: number;
    /** Their part of the tax, and of the tip. `tax + tip === extras`. */
    tax: number;
    tip: number;
    /** Tax and tip together: the figure the server actually distributes. */
    extras: number;
    /** `items + extras`, identical to `computeTabShares` for this person. */
    total: number;
}

/**
 * What each person owes, with the working shown.
 *
 * `total` is the same number `computeTabShares` gives — this is that
 * calculation with its intermediate steps kept, not a second opinion.
 *
 * Tax and tip are reported separately even though the server distributes them
 * as one figure. Carving the tax out of the combined share, rather than
 * distributing each independently, keeps the two halves adding back up to the
 * cent that actually gets charged.
 */
export function computeTabBreakdowns(
    items: TabShareItem[],
    participantIds: number[],
    tax = 0,
    tip = 0
): Record<number, TabBreakdown> {
    const lines = allocateLines(items, participantIds);

    const itemShares: Record<number, number> = {};
    for (const id of participantIds) {
        itemShares[id] = lines[id].reduce((sum, line) => sum + line.amount, 0);
    }

    const extras = distributeProportionally(tax + tip, itemShares);
    const taxOnly = distributeProportionally(tax, itemShares);

    const result: Record<number, TabBreakdown> = {};
    for (const id of participantIds) {
        const taxPart = Math.min(taxOnly[id], extras[id]);
        result[id] = {
            participantId: id,
            lines: lines[id],
            items: itemShares[id],
            tax: taxPart,
            tip: extras[id] - taxPart,
            extras: extras[id],
            total: itemShares[id] + extras[id],
        };
    }

    return result;
}

/**
 * The seat belonging to whoever fronted the bill, found by their account.
 *
 * Both sides of that comparison are nullable and mean unrelated things: an
 * open tab has no payer yet, and an anonymous claimer has no account. Matching
 * one null against the other would pin "paid the bill" on the first guest at
 * the table of every tab still open.
 */
export function payerParticipantId(
    participants: { id: number; user_id: number | null }[],
    payerUserId: number | null | undefined
): number | null {
    if (payerUserId == null) return null;
    return participants.find((p) => p.user_id === payerUserId)?.id ?? null;
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
