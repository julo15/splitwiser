import { describe, it, expect } from 'vitest';
import {
    buildVenmoLink,
    centsToVenmoAmount,
    normalizeVenmoUsername,
    venmoUsernameError,
} from '../venmo';

describe('normalizeVenmoUsername', () => {
    it('drops a leading @', () => {
        expect(normalizeVenmoUsername('@maya-chen')).toBe('maya-chen');
    });

    it('drops surrounding whitespace', () => {
        expect(normalizeVenmoUsername('  maya-chen  ')).toBe('maya-chen');
    });

    it('handles whitespace around the @', () => {
        expect(normalizeVenmoUsername(' @maya ')).toBe('maya');
    });

    it('leaves a clean handle alone', () => {
        expect(normalizeVenmoUsername('maya_chen1')).toBe('maya_chen1');
    });
});

describe('venmoUsernameError', () => {
    it('accepts letters, numbers, dashes and underscores', () => {
        expect(venmoUsernameError('Maya-Chen_1')).toBeNull();
    });

    it('treats empty as fine — it means "remove mine"', () => {
        expect(venmoUsernameError('')).toBeNull();
        expect(venmoUsernameError('   ')).toBeNull();
    });

    it('rejects spaces inside the handle', () => {
        expect(venmoUsernameError('maya chen')).toMatch(/letters, numbers/);
    });

    it('rejects anything over 30 characters', () => {
        expect(venmoUsernameError('a'.repeat(31))).toMatch(/30 characters/);
        expect(venmoUsernameError('a'.repeat(30))).toBeNull();
    });

    it('measures length after stripping the @', () => {
        expect(venmoUsernameError(`@${'a'.repeat(30)}`)).toBeNull();
    });
});

describe('centsToVenmoAmount', () => {
    it('renders cents as decimal dollars', () => {
        expect(centsToVenmoAmount(4235)).toBe('42.35');
    });

    it('always keeps two decimal places', () => {
        expect(centsToVenmoAmount(4200)).toBe('42.00');
        expect(centsToVenmoAmount(5)).toBe('0.05');
    });

    it('rounds a fractional cent rather than truncating', () => {
        expect(centsToVenmoAmount(4235.6)).toBe('42.36');
    });
});

describe('buildVenmoLink', () => {
    const base = {
        username: 'maya-chen',
        amountCents: 8420,
        currency: 'USD',
        action: 'pay' as const,
    };

    it('builds a pay link with the amount pre-filled', () => {
        const url = new URL(buildVenmoLink(base)!);
        expect(url.origin + url.pathname).toBe('https://venmo.com/');
        expect(url.searchParams.get('txn')).toBe('pay');
        expect(url.searchParams.get('recipients')).toBe('maya-chen');
        expect(url.searchParams.get('amount')).toBe('84.20');
    });

    it('asks rather than pays when they owe you', () => {
        const url = new URL(buildVenmoLink({ ...base, action: 'request' })!);
        expect(url.searchParams.get('txn')).toBe('charge');
    });

    it('keeps the transaction private by default', () => {
        const url = new URL(buildVenmoLink(base)!);
        expect(url.searchParams.get('audience')).toBe('private');
    });

    it('carries the note', () => {
        const url = new URL(buildVenmoLink({ ...base, note: 'Tahoe Weekend' })!);
        expect(url.searchParams.get('note')).toBe('Tahoe Weekend');
    });

    it('truncates a very long note', () => {
        const url = new URL(
            buildVenmoLink({ ...base, note: 'x'.repeat(500) })!
        );
        expect(url.searchParams.get('note')!.length).toBe(180);
    });

    it('omits an empty note rather than sending a blank one', () => {
        const url = new URL(buildVenmoLink({ ...base, note: '   ' })!);
        expect(url.searchParams.has('note')).toBe(false);
    });

    it('normalises a handle that still has its @', () => {
        const url = new URL(buildVenmoLink({ ...base, username: '@maya-chen' })!);
        expect(url.searchParams.get('recipients')).toBe('maya-chen');
    });

    it('percent-encodes a note with punctuation', () => {
        const link = buildVenmoLink({ ...base, note: 'Dinner & drinks' })!;
        expect(link).toContain('note=Dinner+%26+drinks');
        expect(new URL(link).searchParams.get('note')).toBe('Dinner & drinks');
    });

    // Venmo is USD-only. Pre-filling a euro figure as dollars would ask for
    // the wrong amount of money, which is worse than not offering the button.
    it('refuses any currency but USD', () => {
        expect(buildVenmoLink({ ...base, currency: 'EUR' })).toBeNull();
        expect(buildVenmoLink({ ...base, currency: 'GBP' })).toBeNull();
    });

    it('refuses a missing or unusable handle', () => {
        expect(buildVenmoLink({ ...base, username: '' })).toBeNull();
        expect(buildVenmoLink({ ...base, username: 'maya chen' })).toBeNull();
    });

    it('refuses a zero or negative amount', () => {
        expect(buildVenmoLink({ ...base, amountCents: 0 })).toBeNull();
        expect(buildVenmoLink({ ...base, amountCents: -500 })).toBeNull();
    });
});
