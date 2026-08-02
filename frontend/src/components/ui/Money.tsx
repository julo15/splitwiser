import React from 'react';
import { formatMoney } from '../../utils/formatters';

/**
 * U+2212 MINUS SIGN. The redesign uses this for negative amounts, never an
 * ASCII hyphen — it is the same width as the digits in a tabular-numeral font,
 * so columns of money stay aligned.
 */
export const MINUS = '−';

export type MoneyTone =
    | 'auto'
    | 'positive'
    | 'negative'
    | 'default'
    | 'muted'
    | 'dim';

export interface MoneyProps {
    /** Amount in cents, as stored throughout the app. */
    amount: number;
    currency: string;
    /**
     * 'never'  — magnitude only ("$60.15"), the default.
     * 'negative' — only negatives get a sign ("−$60.15").
     * 'always' — explicit sign on both ("+$248.60" / "−$60.15").
     */
    sign?: 'never' | 'negative' | 'always';
    /**
     * 'auto' colors by amount: positive is owed-to-you, negative is you-owe.
     * Zero always falls back to the dim tone.
     */
    tone?: MoneyTone;
    className?: string;
}

const TONE_CLASS: Record<Exclude<MoneyTone, 'auto'>, string> = {
    positive: 'text-sw-pos',
    negative: 'text-sw-neg',
    default: 'text-sw-text',
    muted: 'text-sw-muted',
    // A figure that is real but not yet settled — a total for someone who is
    // still picking, say.
    dim: 'text-sw-dim',
};

function resolveTone(tone: MoneyTone, amount: number): string {
    if (tone !== 'auto') return TONE_CLASS[tone];
    if (amount > 0) return TONE_CLASS.positive;
    if (amount < 0) return TONE_CLASS.negative;
    return 'text-sw-dim';
}

/**
 * A money figure in the redesign's house style: tabular numerals, tightened
 * tracking, and a real minus sign. Formatting itself is delegated to
 * utils/formatters so currency handling stays in one place.
 *
 * Size and weight are deliberately not props — pass them via className so each
 * screen can match its mockup (44px on mobile home, 32px on the desktop stat
 * strip, 13.5px in list rows).
 */
const Money: React.FC<MoneyProps> = ({
    amount,
    currency,
    sign = 'never',
    tone = 'default',
    className = '',
}) => {
    // Format the magnitude, then attach the sign ourselves: Intl emits an ASCII
    // hyphen for negatives, and we need U+2212.
    const formatted = formatMoney(Math.abs(amount), currency);

    let prefix = '';
    if (amount < 0 && sign !== 'never') {
        prefix = MINUS;
    } else if (amount > 0 && sign === 'always') {
        prefix = '+';
    }

    return (
        <span className={`sw-num ${resolveTone(tone, amount)} ${className}`.trim()}>
            {prefix}
            {formatted}
        </span>
    );
};

export default Money;
