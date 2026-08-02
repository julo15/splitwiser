import { describe, it, expect } from 'vitest';
import {
    amountToCents,
    formatAmountDisplay,
    pressAmountKey,
} from '../amountInput';
import type { AmountKey } from '../amountInput';

/** Type a whole sequence, starting from empty unless given a seed. */
const type = (keys: string, from = ''): string =>
    [...keys].reduce<string>(
        (value, key) => pressAmountKey(value, key as AmountKey),
        from
    );

describe('pressAmountKey', () => {
    it('builds up a plain amount', () => {
        expect(type('12480')).toBe('12480');
    });

    it('accepts one decimal point', () => {
        expect(type('124.80')).toBe('124.80');
    });

    it('ignores a second decimal point', () => {
        expect(pressAmountKey('124.8', '.')).toBe('124.8');
    });

    it('starts a decimal from zero when "." is typed first', () => {
        expect(type('.5')).toBe('0.5');
    });

    it('stops at two decimal places', () => {
        expect(pressAmountKey('124.80', '5')).toBe('124.80');
        expect(type('124.805')).toBe('124.80');
    });

    it('replaces a lone leading zero rather than extending it', () => {
        expect(pressAmountKey('0', '5')).toBe('5');
        // But zero followed by a decimal is a legitimate start.
        expect(type('0.99')).toBe('0.99');
    });

    it('refuses to pile up leading zeros', () => {
        expect(pressAmountKey('0', '0')).toBe('0');
    });

    it('caps the integer part', () => {
        expect(type('12345678')).toBe('1234567');
    });

    it('does not cap digits after the decimal point', () => {
        // The integer cap applies to the whole part only.
        expect(type('1234567.89')).toBe('1234567.89');
    });

    it('backspaces one character at a time, down to empty', () => {
        expect(pressAmountKey('124.80', 'backspace')).toBe('124.8');
        expect(pressAmountKey('1', 'backspace')).toBe('');
        expect(pressAmountKey('', 'backspace')).toBe('');
    });

    it('can rebuild after backspacing past the decimal point', () => {
        const afterDelete = type('bbb', '124.80'.replace(/b/g, ''));
        expect(afterDelete).toBe('124.80');
        expect(pressAmountKey(pressAmountKey('124.', 'backspace'), '5')).toBe('1245');
    });
});

describe('amountToCents', () => {
    it('converts a well-formed amount', () => {
        expect(amountToCents('124.80')).toBe(12480);
        expect(amountToCents('124.8')).toBe(12480);
        expect(amountToCents('7')).toBe(700);
    });

    it('rounds rather than truncating', () => {
        expect(amountToCents('0.005')).toBe(1);
    });

    it('rejects nothing-entered states', () => {
        expect(amountToCents('')).toBeNull();
        expect(amountToCents('.')).toBeNull();
        expect(amountToCents('0')).toBeNull();
        expect(amountToCents('0.00')).toBeNull();
    });

    it('treats a trailing decimal point as its whole part', () => {
        expect(amountToCents('12.')).toBe(1200);
    });
});

describe('formatAmountDisplay', () => {
    it('shows zero for an empty entry', () => {
        expect(formatAmountDisplay('')).toBe('0');
    });

    it('shows an in-progress entry verbatim', () => {
        // Not snapped to "12.00" — the user is still typing.
        expect(formatAmountDisplay('12.')).toBe('12.');
        expect(formatAmountDisplay('12.5')).toBe('12.5');
    });
});
