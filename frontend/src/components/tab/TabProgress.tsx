import React from 'react';
import { Card, Money } from '../ui';

export interface TabProgressProps {
    /** Value of the lines that have a claimer, in cents. */
    claimed: number;
    /** Every line, claimed or not — the bill before tax and tip, in cents. */
    itemsTotal: number;
    /** Value of the lines nobody has taken, in cents. */
    unclaimed: number;
    /** How many lines that is — the sentence reads better with a count. */
    unclaimedCount: number;
    currency: string;
    className?: string;
}

/**
 * How much of the bill is spoken for.
 *
 * The host's only real question while a tab is live, so it gets the big number
 * and a bar. The sentence underneath is what turns the bar into an instruction:
 * it names what is left rather than restating the percentage.
 *
 * Both numbers are item value only. Tax and tip are not claimed by anybody —
 * they ride along on whatever each person picked — so counting them in would
 * cap a fully claimed tab below 100%.
 */
const TabProgress: React.FC<TabProgressProps> = ({
    claimed,
    itemsTotal,
    unclaimed,
    unclaimedCount,
    currency,
    className = '',
}) => {
    const percent = itemsTotal > 0 ? Math.round((claimed / itemsTotal) * 100) : 0;

    return (
        <Card radius="lg" className={`px-[15px] py-3.5 ${className}`.trim()}>
            <div className="flex items-baseline gap-[7px] mb-[9px] flex-wrap">
                <Money
                    amount={claimed}
                    currency={currency}
                    className="text-[21px] font-medium"
                />
                <span className="text-[12.5px] text-sw-muted">
                    of <Money amount={itemsTotal} currency={currency} tone="muted" /> in
                    items spoken for
                </span>
            </div>

            <div
                className="h-[6px] rounded-[3px] bg-sw-sunk overflow-hidden"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Share of the items claimed"
            >
                <div
                    className="h-full rounded-[3px] bg-sw-accent transition-[width] duration-300"
                    style={{ width: `${percent}%` }}
                />
            </div>

            <p className="text-[12px] text-sw-dim mt-[9px]">
                {unclaimedCount === 0 ? (
                    'Every line has a name on it.'
                ) : (
                    <>
                        {unclaimedCount} {unclaimedCount === 1 ? 'line' : 'lines'} —{' '}
                        <Money amount={unclaimed} currency={currency} tone="dim" /> — still
                        going spare.
                    </>
                )}
            </p>
        </Card>
    );
};

export default TabProgress;
