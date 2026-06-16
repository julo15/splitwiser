// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { formatItemPercent } from '../formatters';

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
