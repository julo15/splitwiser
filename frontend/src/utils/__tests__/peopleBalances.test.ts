import { describe, it, expect } from 'vitest';
import {
    aggregatePeople,
    bucketPeople,
    bucketTotal,
} from '../peopleBalances';
import type { Balance } from '../../types/balance';

const balance = (over: Partial<Balance>): Balance => ({
    user_id: 1,
    full_name: 'Maya Chen',
    amount: 0,
    currency: 'USD',
    ...over,
});

describe('aggregatePeople', () => {
    it('sums a person across groups in the same currency', () => {
        const people = aggregatePeople([
            balance({ amount: 5000, group_id: 1, group_name: 'Tahoe Weekend' }),
            balance({ amount: 3420, group_id: 2, group_name: 'Lunch Crew' }),
        ]);

        expect(people).toHaveLength(1);
        expect(people[0].net).toBe(8420);
        expect(people[0].netCurrency).toBe('USD');
        expect(people[0].groups).toEqual(['Tahoe Weekend', 'Lunch Crew']);
    });

    it('keeps different currencies apart and reports no single net', () => {
        const people = aggregatePeople([
            balance({ amount: 5000, currency: 'USD', group_id: 1 }),
            balance({ amount: 9800, currency: 'EUR', group_id: 2 }),
        ]);

        expect(people[0].net).toBeNull();
        expect(people[0].totals).toHaveLength(2);
        // Sorted by magnitude, so the larger figure leads the row.
        expect(people[0].totals[0]).toEqual({ amount: 9800, currency: 'EUR' });
    });

    it('treats the same guest id in different groups as different people', () => {
        const people = aggregatePeople([
            balance({ user_id: 7, is_guest: true, amount: 100, group_id: 1 }),
            balance({ user_id: 7, is_guest: true, amount: 200, group_id: 2 }),
        ]);
        expect(people).toHaveLength(2);
    });

    it('still merges the same registered user across groups', () => {
        const people = aggregatePeople([
            balance({ user_id: 7, amount: 100, group_id: 1 }),
            balance({ user_id: 7, amount: 200, group_id: 2 }),
        ]);
        expect(people).toHaveLength(1);
        expect(people[0].net).toBe(300);
    });

    it('drops a currency that nets to zero', () => {
        const people = aggregatePeople([
            balance({ amount: 5000, currency: 'EUR', group_id: 1 }),
            balance({ amount: -5000, currency: 'EUR', group_id: 2 }),
            balance({ amount: 1200, currency: 'USD', group_id: 3 }),
        ]);

        // EUR cancelled, leaving a clean single-currency USD figure.
        expect(people[0].totals).toEqual([{ amount: 1200, currency: 'USD' }]);
        expect(people[0].net).toBe(1200);
    });

    it('reports net zero when everything cancels', () => {
        const people = aggregatePeople([
            balance({ amount: 5000, group_id: 1 }),
            balance({ amount: -5000, group_id: 2 }),
        ]);
        expect(people[0].net).toBe(0);
        expect(people[0].totals).toEqual([]);
    });

    it('keeps groupId only while the person sits in one group', () => {
        const single = aggregatePeople([balance({ amount: 100, group_id: 4 })]);
        expect(single[0].groupId).toBe(4);

        const multi = aggregatePeople([
            balance({ amount: 100, group_id: 4 }),
            balance({ amount: 100, group_id: 5 }),
        ]);
        expect(multi[0].groupId).toBeUndefined();
    });
});

describe('bucketPeople', () => {
    it('files people by sign and orders by magnitude', () => {
        const people = aggregatePeople([
            balance({ user_id: 1, full_name: 'Maya', amount: 8420, group_id: 1 }),
            balance({ user_id: 2, full_name: 'Dani', amount: 12655, group_id: 1 }),
            balance({ user_id: 3, full_name: 'Ben', amount: -4215, group_id: 2 }),
            balance({ user_id: 4, full_name: 'Jae', amount: 0, group_id: 2 }),
        ]);

        const buckets = bucketPeople(people);
        expect(buckets.owed.map((p) => p.name)).toEqual(['Dani', 'Maya']);
        expect(buckets.owing.map((p) => p.name)).toEqual(['Ben']);
        expect(buckets.square.map((p) => p.name)).toEqual(['Jae']);
    });

    it('files a mixed-currency person by their largest figure', () => {
        const people = aggregatePeople([
            balance({ amount: -20000, currency: 'EUR', group_id: 1 }),
            balance({ amount: 500, currency: 'USD', group_id: 2 }),
        ]);
        expect(bucketPeople(people).owing).toHaveLength(1);
    });
});

describe('bucketTotal', () => {
    it('totals a single-currency bucket', () => {
        const people = aggregatePeople([
            balance({ user_id: 1, amount: 8420, group_id: 1 }),
            balance({ user_id: 2, amount: 12655, group_id: 1 }),
        ]);
        expect(bucketTotal(people)).toEqual({ amount: 21075, currency: 'USD' });
    });

    it('refuses to total across currencies', () => {
        const people = aggregatePeople([
            balance({ user_id: 1, amount: 8420, currency: 'USD', group_id: 1 }),
            balance({ user_id: 2, amount: 9800, currency: 'EUR', group_id: 2 }),
        ]);
        expect(bucketTotal(people)).toBeNull();
    });

    it('returns null for an empty bucket', () => {
        expect(bucketTotal([])).toBeNull();
    });
});
