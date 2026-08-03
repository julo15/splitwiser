/**
 * These mirror backend/tests/test_tabs_math.py case for case. If the two
 * implementations ever drift, one of these fails.
 */
import { describe, it, expect } from 'vitest';
import {
    claimedTotal,
    computeItemShares,
    computeTabBreakdowns,
    computeTabShares,
    distributeProportionally,
    payerParticipantId,
    splitEvenly,
    toShareItems,
    unclaimedTotal,
} from '../tabShares';
import type { TabShareItem } from '../tabShares';

const item = (
    id: number,
    price: number,
    claimedBy: number[] = [],
    description = `Item ${id}`
): TabShareItem => ({
    id,
    price,
    claimedBy,
    description,
});

describe('splitEvenly', () => {
    it('divides exactly when it can', () => {
        expect(splitEvenly(900, 3)).toEqual([300, 300, 300]);
    });

    it('gives the remainder to the earliest parts', () => {
        expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
        expect(splitEvenly(100, 3).reduce((a, b) => a + b, 0)).toBe(100);
    });

    it('handles one and none', () => {
        expect(splitEvenly(500, 1)).toEqual([500]);
        expect(splitEvenly(500, 0)).toEqual([]);
    });

    it('handles a zero amount', () => {
        expect(splitEvenly(0, 3)).toEqual([0, 0, 0]);
    });
});

describe('computeItemShares', () => {
    it('charges each claimer for what they claimed', () => {
        const shares = computeItemShares(
            [item(1, 2800, [10]), item(2, 3400, [20])],
            [10, 20]
        );
        expect(shares).toEqual({ 10: 2800, 20: 3400 });
    });

    it('splits a shared line between its claimers', () => {
        expect(computeItemShares([item(1, 2800, [10, 20])], [10, 20])).toEqual({
            10: 1400,
            20: 1400,
        });
    });

    it('spreads an unclaimed line across the table', () => {
        expect(computeItemShares([item(1, 900)], [10, 20, 30])).toEqual({
            10: 300,
            20: 300,
            30: 300,
        });
    });

    it('always sums to the item total', () => {
        const shares = computeItemShares(
            [item(1, 2800, [10, 20]), item(2, 3401, [30]), item(3, 999, [10, 20, 30])],
            [10, 20, 30]
        );
        const sum = Object.values(shares).reduce((a, b) => a + b, 0);
        expect(sum).toBe(2800 + 3401 + 999);
    });

    it('ignores a claim from someone no longer at the table', () => {
        expect(computeItemShares([item(1, 1000, [99])], [10, 20])).toEqual({
            10: 500,
            20: 500,
        });
    });

    it('handles no participants', () => {
        expect(computeItemShares([item(1, 100)], [])).toEqual({});
    });
});

describe('distributeProportionally', () => {
    it('splits in proportion to weight', () => {
        expect(distributeProportionally(1000, { 10: 3000, 20: 1000 })).toEqual({
            10: 750,
            20: 250,
        });
    });

    it('always sums exactly', () => {
        const result = distributeProportionally(100, { 10: 100, 20: 100, 30: 100 });
        expect(Object.values(result).reduce((a, b) => a + b, 0)).toBe(100);
    });

    it('falls back to an even split with no weight anywhere', () => {
        expect(distributeProportionally(90, { 10: 0, 20: 0, 30: 0 })).toEqual({
            10: 30,
            20: 30,
            30: 30,
        });
    });

    it('handles a zero amount and no participants', () => {
        expect(distributeProportionally(0, { 10: 500 })).toEqual({ 10: 0 });
        expect(distributeProportionally(100, {})).toEqual({});
    });
});

describe('computeTabShares', () => {
    it('makes tax and tip follow what each person ordered', () => {
        const shares = computeTabShares(
            [item(1, 3000, [10]), item(2, 1000, [20])],
            [10, 20],
            400,
            400
        );
        expect(shares).toEqual({ 10: 3600, 20: 1200 });
    });

    it('conserves the total', () => {
        const shares = computeTabShares(
            [
                item(1, 2800, [10, 20]),
                item(2, 3400, [20]),
                item(3, 3100, [30]),
                item(4, 1200),
            ],
            [10, 20, 30],
            1449,
            3686
        );
        const sum = Object.values(shares).reduce((a, b) => a + b, 0);
        expect(sum).toBe(2800 + 3400 + 3100 + 1200 + 1449 + 3686);
    });

    it('matches the worked example from the design', () => {
        const items = [
            item(1, 2800, [10]), item(2, 3400, [20]),
            item(3, 3100, [30]), item(4, 1200, [40]),
            item(5, 1800, [10]), item(6, 1600, [20]),
            item(7, 900, [30]), item(8, 1300, [40]),
        ];
        const shares = computeTabShares(items, [10, 20, 30, 40], 1449, 3686);
        expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBe(21235);
    });

    it('balances a tab nobody claimed', () => {
        const shares = computeTabShares(
            [item(1, 1000), item(2, 500)],
            [10, 20],
            100,
            50
        );
        expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBe(1650);
    });
});

describe('toShareItems', () => {
    it('renames the API shape without touching the numbers', () => {
        expect(
            toShareItems([
                {
                    id: 7,
                    price: 2800,
                    description: 'Pizza margherita',
                    claimed_by: [10, 20],
                },
            ])
        ).toEqual([
            {
                id: 7,
                price: 2800,
                description: 'Pizza margherita',
                claimedBy: [10, 20],
            },
        ]);
    });
});

describe('computeTabBreakdowns', () => {
    it('agrees with computeTabShares, to the cent', () => {
        const items = [
            item(1, 2800, [10, 20]),
            item(2, 3401, [20]),
            item(3, 999, [30]),
            item(4, 1200),
        ];
        const ids = [10, 20, 30];

        const breakdowns = computeTabBreakdowns(items, ids, 1449, 3686);
        const shares = computeTabShares(items, ids, 1449, 3686);

        for (const id of ids) {
            expect(breakdowns[id].total).toBe(shares[id]);
        }
    });

    it('shows lines that add up to the person subtotal', () => {
        const breakdowns = computeTabBreakdowns(
            [item(1, 2800, [10, 20]), item(2, 3400, [20])],
            [10, 20],
            400,
            600
        );

        for (const breakdown of Object.values(breakdowns)) {
            const summed = breakdown.lines.reduce((sum, line) => sum + line.amount, 0);
            expect(summed).toBe(breakdown.items);
            expect(breakdown.items + breakdown.extras).toBe(breakdown.total);
        }
    });

    it('splits a shared line and says how many ways', () => {
        const breakdowns = computeTabBreakdowns(
            [item(1, 2800, [10, 20], 'Pizza')],
            [10, 20]
        );

        expect(breakdowns[10].lines).toEqual([
            {
                itemId: 1,
                description: 'Pizza',
                price: 2800,
                amount: 1400,
                splitCount: 2,
                orphan: false,
            },
        ]);
    });

    it('marks a line nobody claimed on everyone it falls to', () => {
        const breakdowns = computeTabBreakdowns([item(1, 900, [], 'Olives')], [10, 20, 30]);

        for (const id of [10, 20, 30]) {
            expect(breakdowns[id].lines).toHaveLength(1);
            expect(breakdowns[id].lines[0]).toMatchObject({
                description: 'Olives',
                amount: 300,
                splitCount: 3,
                orphan: true,
            });
        }
    });

    it('leaves out a line the person had nothing to do with', () => {
        const breakdowns = computeTabBreakdowns(
            [item(1, 2800, [10]), item(2, 1000, [20])],
            [10, 20]
        );

        expect(breakdowns[10].lines.map((line) => line.itemId)).toEqual([1]);
        expect(breakdowns[20].lines.map((line) => line.itemId)).toEqual([2]);
    });

    it('reports tax and tip separately, summing to what the server charges', () => {
        const items = [item(1, 3000, [10]), item(2, 1000, [20])];
        const breakdowns = computeTabBreakdowns(items, [10, 20], 401, 799);
        const shares = computeTabShares(items, [10, 20], 401, 799);

        for (const id of [10, 20]) {
            // The pair always reconstitutes the combined figure, which is the
            // one the server distributes and records.
            expect(breakdowns[id].tax + breakdowns[id].tip).toBe(breakdowns[id].extras);
            expect(breakdowns[id].items + breakdowns[id].extras).toBe(shares[id]);
        }

        // And the whole thing still lands exactly on the bill.
        const total = Object.values(breakdowns).reduce((sum, b) => sum + b.total, 0);
        expect(total).toBe(3000 + 1000 + 401 + 799);
    });

    it('leaves the tip at zero when the bill has no tip', () => {
        const breakdowns = computeTabBreakdowns(
            [item(1, 3000, [10]), item(2, 1000, [20])],
            [10, 20],
            405,
            0
        );

        for (const id of [10, 20]) {
            expect(breakdowns[id].tip).toBe(0);
            expect(breakdowns[id].tax).toBe(breakdowns[id].extras);
        }
    });

    it('leaves the tax at zero when the bill has no tax', () => {
        const breakdowns = computeTabBreakdowns(
            [item(1, 3000, [10]), item(2, 1000, [20])],
            [10, 20],
            0,
            405
        );

        for (const id of [10, 20]) {
            expect(breakdowns[id].tax).toBe(0);
            expect(breakdowns[id].tip).toBe(breakdowns[id].extras);
        }
    });

    it('gives someone who claimed nothing an empty, zeroed breakdown', () => {
        const breakdowns = computeTabBreakdowns([item(1, 2800, [10])], [10, 20], 200, 300);

        expect(breakdowns[20].lines).toEqual([]);
        expect(breakdowns[20].items).toBe(0);
        expect(breakdowns[20].total).toBe(0);
    });

    it('handles no participants', () => {
        expect(computeTabBreakdowns([item(1, 100)], [], 50, 50)).toEqual({});
    });
});

describe('payerParticipantId', () => {
    const table = [
        { id: 1, user_id: 7 },
        { id: 2, user_id: null },
        { id: 3, user_id: 9 },
    ];

    it('finds the seat belonging to the paying account', () => {
        expect(payerParticipantId(table, 9)).toBe(3);
    });

    it('names nobody while the tab is still open', () => {
        // The bug: null payer matched the first anonymous seat, whose user_id
        // is also null, and pinned "paid the bill" on a guest.
        expect(payerParticipantId(table, null)).toBeNull();
        expect(payerParticipantId(table, undefined)).toBeNull();
    });

    it('names nobody when the payer has left the table', () => {
        expect(payerParticipantId(table, 99)).toBeNull();
    });
});

describe('claimed and unclaimed totals', () => {
    it('separates the lines that still need a home', () => {
        const items = [item(1, 3100), item(2, 1300), item(3, 2800, [10])];
        expect(unclaimedTotal(items)).toBe(4400);
        expect(claimedTotal(items)).toBe(2800);
    });

    it('is zero either way on an empty tab', () => {
        expect(unclaimedTotal([])).toBe(0);
        expect(claimedTotal([])).toBe(0);
    });
});
