import { describe, it, expect } from 'vitest';
import {
    reconcileReceipt,
    reconciliationWarning,
} from '../receiptReconciliation';

const lines = (...prices: number[]) => prices.map((price) => ({ price }));
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

describe('reconcileReceipt', () => {
    it('balances when the lines account for the printed total', () => {
        // 161.00 items + 14.49 tax + 36.86 tip = 212.35
        const result = reconcileReceipt(
            lines(2800, 3400, 3100, 1200, 1800, 1600, 900, 1300),
            1449,
            3686,
            21235
        );
        expect(result.itemsSum).toBe(16100);
        expect(result.computed).toBe(21235);
        expect(result.delta).toBe(0);
        expect(result.status).toBe('balanced');
    });

    it('reports being under when a line was missed', () => {
        // The mockup's case: computed 210.25 against a printed 212.35.
        const result = reconcileReceipt(lines(15890), 1449, 3686, 21235);
        expect(result.computed).toBe(21025);
        expect(result.delta).toBe(210);
        expect(result.status).toBe('under');
    });

    it('reports being over when the lines overshoot', () => {
        const result = reconcileReceipt(lines(16310), 1449, 3686, 21235);
        expect(result.delta).toBe(-210);
        expect(result.status).toBe('over');
    });

    it('treats a one-cent difference as rounding', () => {
        expect(reconcileReceipt(lines(9999), 0, 0, 10000).status).toBe('balanced');
        expect(reconcileReceipt(lines(10001), 0, 0, 10000).status).toBe('balanced');
        // Two cents is a real difference.
        expect(reconcileReceipt(lines(9998), 0, 0, 10000).status).toBe('under');
    });

    it('treats missing tax and tip as zero', () => {
        const result = reconcileReceipt(lines(1000, 2000), null, null, 3000);
        expect(result.computed).toBe(3000);
        expect(result.status).toBe('balanced');
    });

    it('cannot reconcile without a printed total', () => {
        const result = reconcileReceipt(lines(1000), 100, 200, null);
        expect(result.delta).toBeNull();
        expect(result.status).toBe('unknown');
        expect(result.computed).toBe(1300);
    });

    it('handles an empty receipt', () => {
        const result = reconcileReceipt([], null, null, 500);
        expect(result.itemsSum).toBe(0);
        expect(result.delta).toBe(500);
        expect(result.status).toBe('under');
    });
});

describe('reconciliationWarning', () => {
    it('says nothing when balanced or unknown', () => {
        expect(
            reconciliationWarning(reconcileReceipt(lines(1000), 0, 0, 1000), money)
        ).toBeNull();
        expect(
            reconciliationWarning(reconcileReceipt(lines(1000), 0, 0, null), money)
        ).toBeNull();
    });

    it('names the gap in both directions', () => {
        const under = reconciliationWarning(
            reconcileReceipt(lines(900), 0, 0, 1000),
            money
        );
        expect(under).toContain('$1.00');
        expect(under).toContain('under');

        const over = reconciliationWarning(
            reconcileReceipt(lines(1100), 0, 0, 1000),
            money
        );
        expect(over).toContain('$1.00');
        expect(over).toContain('over');
    });
});
