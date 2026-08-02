/**
 * Venmo hand-off for settling up.
 *
 * Splitwiser records that a debt was settled; it never moves money. This builds
 * the link that hands the payment to Venmo with the recipient, amount and note
 * already filled in, so the person paying does not retype a figure they might
 * get wrong.
 *
 * Opening the link is NOT the same as being paid. Nothing here marks anything
 * settled — recording stays a separate, deliberate action, because we have no
 * way to learn whether the payment actually went through.
 */

/** Venmo settles in US dollars only. */
export const VENMO_CURRENCY = 'USD';

/** Venmo truncates long notes; keep well inside whatever the current limit is. */
const NOTE_MAX = 180;

export type VenmoAction = 'pay' | 'request';

export interface VenmoLinkInput {
    /** Handle without the leading @. */
    username: string;
    /** Amount in cents, as stored throughout the app. Must be positive. */
    amountCents: number;
    /** ISO currency of the debt — anything but USD is refused. */
    currency: string;
    /** 'pay' when you owe them, 'request' when they owe you. */
    action: VenmoAction;
    /** What the payment is for. Trimmed and truncated. */
    note?: string;
}

/**
 * Normalise a handle the way the server does: drop a leading @ and surrounding
 * whitespace. Exported so the settings field can show the stored form as you
 * type rather than surprising you after a save.
 */
export function normalizeVenmoUsername(raw: string): string {
    return raw.trim().replace(/^@+/, '').trim();
}

/** The character set Venmo handles use. Length is checked separately. */
const HANDLE = /^[A-Za-z0-9_-]+$/;

/**
 * Why a handle is unusable, or null when it is fine. The message is shown to
 * the person typing it.
 */
export function venmoUsernameError(raw: string): string | null {
    const handle = normalizeVenmoUsername(raw);
    if (!handle) return null; // empty means "remove mine", not an error
    if (handle.length > 30) return 'Venmo usernames are at most 30 characters.';
    if (!HANDLE.test(handle)) {
        return 'Use letters, numbers, dashes and underscores only.';
    }
    return null;
}

/** Cents to the plain decimal string Venmo expects: 4235 → "42.35". */
export function centsToVenmoAmount(cents: number): string {
    return (Math.round(cents) / 100).toFixed(2);
}

/**
 * Build the Venmo link, or null when we should not offer one.
 *
 * Returns null rather than a broken link when the currency is not USD: Venmo
 * has no notion of the other currencies this app supports, and handing it
 * "52.14" from a EUR debt would pre-fill the wrong number of dollars. The
 * caller is expected to explain the omission rather than silently drop it.
 *
 * The https form is deliberate over the venmo:// scheme. On a phone it is a
 * universal link and opens the app; on a desktop it opens the website. A
 * custom scheme would simply fail on desktop, and the desktop is where the
 * settle-up screen has the most room.
 */
export function buildVenmoLink(input: VenmoLinkInput): string | null {
    const username = normalizeVenmoUsername(input.username);
    if (!username || venmoUsernameError(username)) return null;
    if (input.currency !== VENMO_CURRENCY) return null;
    if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) return null;

    const params = new URLSearchParams({
        txn: input.action === 'pay' ? 'pay' : 'charge',
        audience: 'private',
        recipients: username,
        amount: centsToVenmoAmount(input.amountCents),
    });

    const note = input.note?.trim();
    if (note) params.set('note', note.slice(0, NOTE_MAX));

    return `https://venmo.com/?${params.toString()}`;
}
