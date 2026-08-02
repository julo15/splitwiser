/**
 * Keypad editing for the add-expense amount.
 *
 * The redesign enters amounts through a keypad rather than a text field, so the
 * value is a string being edited one keystroke at a time — not a number. Kept
 * separate from the component so the rules are testable on their own.
 */

export type AmountKey =
    | '0'
    | '1'
    | '2'
    | '3'
    | '4'
    | '5'
    | '6'
    | '7'
    | '8'
    | '9'
    | '.'
    | 'backspace';

/** Digits before the decimal point. 9,999,999.99 is well past any real bill. */
const MAX_INTEGER_DIGITS = 7;
const MAX_DECIMALS = 2;

/**
 * Apply one keypress to the current amount string.
 *
 * Returns the value unchanged when the key would produce something invalid —
 * a third decimal place, a second decimal point, or a leading run of zeros.
 */
export function pressAmountKey(current: string, key: AmountKey): string {
    if (key === 'backspace') {
        return current.slice(0, -1);
    }

    if (key === '.') {
        // One decimal point only; typing "." first gives "0.".
        if (current.includes('.')) return current;
        return current === '' ? '0.' : `${current}.`;
    }

    const [whole = '', decimals] = current.split('.');

    if (decimals !== undefined) {
        if (decimals.length >= MAX_DECIMALS) return current;
        return `${current}${key}`;
    }

    // A lone leading zero is replaced rather than extended.
    if (current === '0') return key === '0' ? current : key;
    if (whole.length >= MAX_INTEGER_DIGITS) return current;

    return `${current}${key}`;
}

/**
 * The amount in cents, rounded, or null when nothing usable has been entered.
 * Trailing "." and empty input both count as nothing.
 */
export function amountToCents(current: string): number | null {
    if (current === '' || current === '.') return null;
    const value = parseFloat(current);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value * 100);
}

/**
 * What the keypad shows. An in-progress entry is shown verbatim so the caret
 * sits where the user is typing — "12." stays "12." rather than snapping to
 * "12.00".
 */
export function formatAmountDisplay(current: string): string {
    return current === '' ? '0' : current;
}
