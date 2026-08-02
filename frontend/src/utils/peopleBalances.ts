import type { Balance } from '../types/balance';

export interface CurrencyTotal {
    amount: number;
    currency: string;
}

export interface PersonBalance {
    /** Stable React key; guests are keyed by group since ids can collide. */
    key: string;
    userId: number;
    isGuest: boolean;
    name: string;
    /** Net per currency, largest magnitude first. */
    totals: CurrencyTotal[];
    /** Distinct group names this person owes across, for the subtitle. */
    groups: string[];
    /** Set when every balance for this person came from one group. */
    groupId?: number;
    /**
     * The single net figure, when the person's balances share one currency.
     * Null when they span currencies — those cannot be summed client-side, so
     * the caller should render each of `totals` instead.
     */
    net: number | null;
    netCurrency: string | null;
}

export interface PeopleBuckets {
    /** Positive net — they owe you. */
    owed: PersonBalance[];
    /** Negative net — you owe them. */
    owing: PersonBalance[];
    /** Net zero. */
    square: PersonBalance[];
}

/**
 * Collapse the flat balance list into one entry per person.
 *
 * The API returns a row per person *per group per currency*, so someone in
 * three shared groups appears three times. The lists in the redesign are
 * person-first, so those rows are summed per currency here.
 */
export function aggregatePeople(balances: Balance[]): PersonBalance[] {
    const byPerson = new Map<string, PersonBalance>();

    for (const balance of balances) {
        // Guests are scoped to their group: the same guest id in two groups is
        // two different people.
        const key = balance.is_guest
            ? `guest-${balance.group_id ?? 'none'}-${balance.user_id}`
            : `user-${balance.user_id}`;

        let person = byPerson.get(key);
        if (!person) {
            person = {
                key,
                userId: balance.user_id,
                isGuest: Boolean(balance.is_guest),
                name: balance.full_name,
                totals: [],
                groups: [],
                groupId: balance.group_id,
                net: null,
                netCurrency: null,
            };
            byPerson.set(key, person);
        }

        const existing = person.totals.find((t) => t.currency === balance.currency);
        if (existing) {
            existing.amount += balance.amount;
        } else {
            person.totals.push({
                amount: balance.amount,
                currency: balance.currency,
            });
        }

        if (balance.group_name && !person.groups.includes(balance.group_name)) {
            person.groups.push(balance.group_name);
        }
        // Once a second group appears, no single group identifies this person.
        if (person.groupId !== balance.group_id) {
            person.groupId = undefined;
        }
    }

    for (const person of byPerson.values()) {
        // Drop currencies that cancelled out, so a person square in EUR but
        // owing in USD resolves to a clean single-currency figure.
        person.totals = person.totals.filter((t) => t.amount !== 0);
        person.totals.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

        if (person.totals.length === 0) {
            person.net = 0;
            person.netCurrency = null;
        } else if (person.totals.length === 1) {
            person.net = person.totals[0].amount;
            person.netCurrency = person.totals[0].currency;
        } else {
            person.net = null;
            person.netCurrency = null;
        }
    }

    return Array.from(byPerson.values());
}

/**
 * Split people into the three sections the design uses: owes you, you owe, all
 * square. Mixed-currency people (net === null) are filed by the sign of their
 * largest single-currency figure, since that is what leads their row.
 */
export function bucketPeople(people: PersonBalance[]): PeopleBuckets {
    const buckets: PeopleBuckets = { owed: [], owing: [], square: [] };

    for (const person of people) {
        const lead = person.net !== null ? person.net : (person.totals[0]?.amount ?? 0);
        if (lead > 0) buckets.owed.push(person);
        else if (lead < 0) buckets.owing.push(person);
        else buckets.square.push(person);
    }

    const byMagnitude = (a: PersonBalance, b: PersonBalance) => {
        const aMag = Math.abs(a.net ?? a.totals[0]?.amount ?? 0);
        const bMag = Math.abs(b.net ?? b.totals[0]?.amount ?? 0);
        if (aMag !== bMag) return bMag - aMag;
        return a.name.localeCompare(b.name);
    };

    buckets.owed.sort(byMagnitude);
    buckets.owing.sort(byMagnitude);
    buckets.square.sort((a, b) => a.name.localeCompare(b.name));

    return buckets;
}

/**
 * Section total for a bucket, as shown in the "Owes you · $308.75" heading.
 * Returns null when the bucket spans currencies and cannot be totalled.
 */
export function bucketTotal(people: PersonBalance[]): CurrencyTotal | null {
    const currencies = new Set<string>();
    for (const person of people) {
        for (const total of person.totals) currencies.add(total.currency);
    }
    if (currencies.size !== 1) return null;

    const currency = [...currencies][0];
    const amount = people.reduce(
        (sum, person) =>
            sum + person.totals.reduce((personSum, t) => personSum + t.amount, 0),
        0
    );
    return { amount, currency };
}
