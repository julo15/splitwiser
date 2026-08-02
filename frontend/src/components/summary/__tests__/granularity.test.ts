// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { granularityWord, granularityLabel } from '../granularity';
import type { SummaryGranularity } from '../../../types/summary';

const ALL: SummaryGranularity[] = ['week', 'month', 'quarter'];

describe('granularityWord', () => {
    it.each([
        ['week', 'Weekly'],
        ['month', 'Monthly'],
        ['quarter', 'Quarterly'],
    ] as const)('renders %s as %s', (granularity, expected) => {
        expect(granularityWord(granularity)).toBe(expected);
    });

    it('gives every granularity a distinct word', () => {
        const words = ALL.map(granularityWord);
        expect(new Set(words).size).toBe(ALL.length);
    });
});

describe('granularityLabel', () => {
    it.each([
        ['week', 'Weekly breakdown'],
        ['month', 'Monthly breakdown'],
        ['quarter', 'Quarterly breakdown'],
    ] as const)('renders %s as "%s"', (granularity, expected) => {
        expect(granularityLabel(granularity)).toBe(expected);
    });

    it('builds the label from the matching word', () => {
        for (const granularity of ALL) {
            expect(granularityLabel(granularity)).toBe(`${granularityWord(granularity)} breakdown`);
        }
    });
});
