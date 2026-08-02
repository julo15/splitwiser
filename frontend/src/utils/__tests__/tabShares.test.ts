/**
 * These mirror backend/tests/test_tabs_math.py case for case. If the two
 * implementations ever drift, one of these fails.
 */
import { describe, it, expect } from 'vitest';
import {
    claimedTotal,
    computeItemShares,
    computeTabShares,
    distributeProportionally,
    splitEvenly,
    unclaimedTotal,
} from '../tabShares';
import type { TabShareItem } from '../tabShares';

const item = (id: number, price: number, claimedBy: number[] = []): TabShareItem => ({
    id,
    price,
    claimedBy,
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
