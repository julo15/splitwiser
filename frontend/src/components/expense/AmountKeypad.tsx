import React from 'react';
import { Backspace, CaretDown } from '@phosphor-icons/react';
import { formatAmountDisplay, pressAmountKey } from '../../utils/amountInput';
import type { AmountKey } from '../../utils/amountInput';

export interface AmountKeypadProps {
    /** The raw entry string, e.g. "124.8". */
    value: string;
    onChange: (value: string) => void;
    currency: string;
    /** Opens the currency picker. Omit to render the code as a plain label. */
    onCurrencyPress?: () => void;
}

const KEYS: AmountKey[] = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    '.', '0', 'backspace',
];

const CURRENCY_SYMBOL: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CAD: '$',
    CNY: '¥',
    HKD: '$',
    CHF: 'Fr',
};

/**
 * The amount hero — the figure being typed, at display size — with the keypad
 * that drives it.
 *
 * A keypad rather than a text input: it is the one number in the flow the user
 * always types, and on mobile it removes the wait for the system keyboard.
 */
export const AmountDisplay: React.FC<{
    value: string;
    currency: string;
    onCurrencyPress?: () => void;
}> = ({ value, currency, onCurrencyPress }) => (
    <div className="px-[18px] text-center">
        <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-[26px] text-sw-dim">
                {CURRENCY_SYMBOL[currency] ?? ''}
            </span>
            <span className="sw-num text-[60px] font-medium tracking-[-0.03em] leading-none">
                {formatAmountDisplay(value)}
            </span>
            {/* A caret, so the figure reads as an active field. */}
            <span
                className="w-0.5 h-12 rounded-[1px] bg-sw-accent ml-0.5"
                aria-hidden="true"
            />
        </div>

        {onCurrencyPress ? (
            <button
                type="button"
                onClick={onCurrencyPress}
                className="inline-flex items-center gap-1.5 mt-1.5 px-[11px] py-1 rounded-full bg-sw-surface text-xs text-sw-muted shadow-[0_0_0_1px_var(--sw-line)] focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
            >
                {currency}
                <CaretDown size={12} />
            </button>
        ) : (
            <div className="inline-flex mt-1.5 px-[11px] py-1 rounded-full bg-sw-surface text-xs text-sw-muted shadow-[0_0_0_1px_var(--sw-line)]">
                {currency}
            </div>
        )}
    </div>
);

const AmountKeypad: React.FC<AmountKeypadProps> = ({ value, onChange }) => (
    <div
        className="px-3 pt-3 pb-1 bg-sw-sunk border-t border-sw-line"
        style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
    >
        <div className="grid grid-cols-3 gap-2">
            {KEYS.map((key) => (
                <button
                    key={key}
                    type="button"
                    aria-label={key === 'backspace' ? 'Delete' : key}
                    onClick={() => onChange(pressAmountKey(value, key))}
                    className={`h-[46px] flex items-center justify-center rounded-[11px] text-[23px] active:brightness-110 focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2 ${
                        key === 'backspace'
                            ? 'bg-sw-raise text-sw-muted'
                            : key === '.'
                              ? 'bg-sw-surface text-sw-muted'
                              : 'bg-sw-surface text-sw-text'
                    }`}
                >
                    {key === 'backspace' ? <Backspace size={21} /> : key}
                </button>
            ))}
        </div>
    </div>
);

export default AmountKeypad;
