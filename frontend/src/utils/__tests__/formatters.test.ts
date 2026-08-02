// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    formatMoney,
    formatDate,
    formatDateForInput,
    formatItemPercent,
    getUserDisplayName,
} from '../formatters';

describe('formatMoney', () => {
    it('renders cents as a dollar amount', () => {
        expect(formatMoney(1234, 'USD')).toBe('$12.34');
    });

    it('renders zero', () => {
        expect(formatMoney(0, 'USD')).toBe('$0.00');
    });

    it('renders a negative amount', () => {
        expect(formatMoney(-1234, 'USD')).toBe('-$12.34');
    });

    it('keeps the leading zero on sub-dollar amounts', () => {
        expect(formatMoney(5, 'USD')).toBe('$0.05');
    });

    it('groups thousands', () => {
        expect(formatMoney(123456789, 'USD')).toBe('$1,234,567.89');
    });

    it.each([
        ['EUR', '€'],
        ['GBP', '£'],
        ['JPY', '¥'],
    ])('uses the %s symbol', (currency, symbol) => {
        expect(formatMoney(1000, currency)).toContain(symbol);
    });

    it('renders JPY without decimal places', () => {
        expect(formatMoney(150000, 'JPY')).toBe('¥1,500');
    });

    it('returns a stable result when called repeatedly (formatter cache)', () => {
        expect(formatMoney(1234, 'USD')).toBe(formatMoney(1234, 'USD'));
    });
});

describe('formatDate', () => {
    it('renders a plain ISO date in long form', () => {
        expect(formatDate('2025-01-15')).toBe('January 15, 2025');
    });

    it('does not shift the day across a timezone boundary', () => {
        // Parsing "2025-01-01" as UTC would render as Dec 31 west of Greenwich.
        expect(formatDate('2025-01-01')).toBe('January 1, 2025');
    });

    it('accepts custom format options', () => {
        expect(formatDate('2025-01-15', { month: 'short', day: 'numeric' })).toBe('Jan 15');
    });

    it('handles an ISO datetime string', () => {
        expect(formatDate('2025-01-15T12:00:00')).toBe('January 15, 2025');
    });

    it('renders a leap day', () => {
        expect(formatDate('2024-02-29')).toBe('February 29, 2024');
    });

    it('reports an unparseable string as an invalid date', () => {
        expect(formatDate('not-a-date')).toBe('Invalid Date');
    });

    it('caches by options, not by date', () => {
        // A second call with different options must not reuse the first formatter.
        expect(formatDate('2025-01-15')).toBe('January 15, 2025');
        expect(formatDate('2025-03-20', { year: 'numeric' })).toBe('2025');
        expect(formatDate('2025-01-15')).toBe('January 15, 2025');
    });
});

describe('formatDateForInput', () => {
    it('renders YYYY-MM-DD', () => {
        expect(formatDateForInput(new Date(2025, 0, 15))).toBe('2025-01-15');
    });

    it('zero-pads single-digit months and days', () => {
        expect(formatDateForInput(new Date(2025, 8, 5))).toBe('2025-09-05');
    });

    it('uses local components rather than UTC', () => {
        // Late-evening local time must not roll forward to the next UTC day.
        expect(formatDateForInput(new Date(2025, 5, 10, 23, 30))).toBe('2025-06-10');
    });

    it('round-trips through formatDate', () => {
        const date = new Date(2025, 11, 27);
        expect(formatDate(formatDateForInput(date))).toBe('December 27, 2025');
    });

    it('defaults to today', () => {
        expect(formatDateForInput()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('formatItemPercent', () => {
    it('renders a whole number without a decimal', () => {
        expect(formatItemPercent(50)).toBe('50');
    });

    it('rounds to one decimal place', () => {
        expect(formatItemPercent(33.333)).toBe('33.3');
    });

    it('rounds up to a whole number, trimming the trailing .0', () => {
        expect(formatItemPercent(99.97)).toBe('100');
    });

    it('renders zero as "0"', () => {
        expect(formatItemPercent(0)).toBe('0');
    });
});

describe('getUserDisplayName', () => {
    it('renders the current user as "You"', () => {
        expect(getUserDisplayName(5, 'Alice', 5)).toBe('You');
    });

    it('renders other users by name', () => {
        expect(getUserDisplayName(6, 'Bob', 5)).toBe('Bob');
    });
});
