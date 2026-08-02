// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    CURRENCIES,
    getCurrencyInfo,
    formatCurrencyDisplay,
    getAllCurrencyCodes,
} from '../currencyHelpers';

describe('CURRENCIES', () => {
    it('covers the eight supported currencies', () => {
        expect(getAllCurrencyCodes()).toEqual([
            'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'CNY', 'HKD', 'CHF',
        ]);
    });

    it('has no duplicate codes', () => {
        const codes = getAllCurrencyCodes();
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('gives every currency a flag and a name', () => {
        for (const currency of CURRENCIES) {
            expect(currency.flag).not.toBe('');
            expect(currency.name).not.toBe('');
        }
    });

    it('lists USD first as the default', () => {
        expect(CURRENCIES[0].code).toBe('USD');
    });
});

describe('getCurrencyInfo', () => {
    it('looks a currency up by code', () => {
        expect(getCurrencyInfo('EUR')).toEqual({ code: 'EUR', flag: '🇪🇺', name: 'Euro' });
    });

    it('returns undefined for an unknown code', () => {
        expect(getCurrencyInfo('XYZ')).toBeUndefined();
    });

    it('is case sensitive', () => {
        expect(getCurrencyInfo('usd')).toBeUndefined();
    });
});

describe('formatCurrencyDisplay', () => {
    it('renders flag, code and name', () => {
        expect(formatCurrencyDisplay('USD')).toBe('🇺🇸 USD - US Dollar');
    });

    it('renders each supported currency without leaking "undefined"', () => {
        for (const code of getAllCurrencyCodes()) {
            expect(formatCurrencyDisplay(code)).not.toContain('undefined');
        }
    });

    it('falls back to the raw code when unknown', () => {
        expect(formatCurrencyDisplay('XYZ')).toBe('XYZ');
    });
});
